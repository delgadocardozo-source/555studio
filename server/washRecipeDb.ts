/**
 * Armado de lavado (recetas) + consumo de stock al finalizar turno.
 * Independiente de la UI de agenda; se dispara desde finalize.
 */
import { eq } from "drizzle-orm";
import { get as getBlob, put as putBlob } from "@vercel/blob";
import {
  emptyWashRecipes,
  expandWashConsumption,
  recipeHasLines,
  sanitizeRecipeLines,
  type WashRecipeLine,
  type WashRecipes,
  type WashVehicleType,
  WASH_VEHICLE_TYPES,
} from "../shared/washRecipe";
import type { StockMovement } from "../shared/inventory";
import { getDb } from "./db";
import { washRecipeLines, washStockConsumptions } from "../drizzle/schema";
import * as inventoryDb from "./inventoryDb";

const BLOB_PATH = "555-detail-agenda/data/wash-recipes.json";

type BlobStore = {
  recipes: WashRecipes;
  /** appointmentId → ISO consumedAt (idempotencia) */
  consumed: Record<string, string>;
};

function isBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readBlob(): Promise<BlobStore> {
  const result = await getBlob(BLOB_PATH, { access: "private", useCache: false });
  if (!result?.stream) return { recipes: emptyWashRecipes(), consumed: {} };
  try {
    const parsed = JSON.parse(await new Response(result.stream).text());
    const recipes = emptyWashRecipes();
    for (const t of WASH_VEHICLE_TYPES) {
      recipes[t] = sanitizeRecipeLines(Array.isArray(parsed?.recipes?.[t]) ? parsed.recipes[t] : []);
    }
    return {
      recipes,
      consumed:
        parsed?.consumed && typeof parsed.consumed === "object" && !Array.isArray(parsed.consumed)
          ? parsed.consumed
          : {},
    };
  } catch {
    return { recipes: emptyWashRecipes(), consumed: {} };
  }
}

async function writeBlob(data: BlobStore) {
  await putBlob(BLOB_PATH, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

let chain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function loadRecipesFromSql(): Promise<WashRecipes> {
  const db = await getDb();
  if (!db) return emptyWashRecipes();
  const rows = await db.select().from(washRecipeLines);
  const recipes = emptyWashRecipes();
  for (const row of rows) {
    const t = row.vehicleType as WashVehicleType;
    if (!WASH_VEHICLE_TYPES.includes(t)) continue;
    recipes[t].push({
      itemId: row.itemId,
      quantityPerVehicle: row.quantityPerVehicle,
    });
  }
  for (const t of WASH_VEHICLE_TYPES) {
    recipes[t] = sanitizeRecipeLines(recipes[t]);
  }
  return recipes;
}

export async function getWashRecipes(): Promise<WashRecipes> {
  if (isBlob()) {
    const store = await readBlob();
    return store.recipes;
  }
  return loadRecipesFromSql();
}

export async function setWashRecipes(input: Partial<WashRecipes>): Promise<WashRecipes> {
  const current = await getWashRecipes();
  const next = emptyWashRecipes();
  for (const t of WASH_VEHICLE_TYPES) {
    next[t] = sanitizeRecipeLines(input[t] !== undefined ? input[t]! : current[t]);
  }

  if (isBlob()) {
    return withLock(async () => {
      const store = await readBlob();
      store.recipes = next;
      await writeBlob(store);
      return next;
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  // Replace-all strategy per vehicle type present in input (and always persist full next).
  await db.delete(washRecipeLines);
  for (const t of WASH_VEHICLE_TYPES) {
    for (const line of next[t]) {
      await db.insert(washRecipeLines).values({
        vehicleType: t,
        itemId: line.itemId,
        quantityPerVehicle: line.quantityPerVehicle,
      });
    }
  }
  return next;
}

export async function setWashRecipeForType(
  vehicleType: WashVehicleType,
  lines: WashRecipeLine[]
): Promise<WashRecipes> {
  return setWashRecipes({ [vehicleType]: lines });
}

async function wasConsumed(appointmentId: number): Promise<boolean> {
  if (isBlob()) {
    const store = await readBlob();
    return Boolean(store.consumed[String(appointmentId)]);
  }
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select()
    .from(washStockConsumptions)
    .where(eq(washStockConsumptions.appointmentId, appointmentId))
    .limit(1);
  return rows.length > 0;
}

async function markConsumed(appointmentId: number, notes: string) {
  const now = new Date().toISOString();
  if (isBlob()) {
    return withLock(async () => {
      const store = await readBlob();
      store.consumed[String(appointmentId)] = now;
      await writeBlob(store);
    });
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.insert(washStockConsumptions).values({
    appointmentId,
    notes: notes || null,
  });
}

export type WashConsumeResult = {
  skipped: boolean;
  reason?: string;
  movements: StockMovement[];
};

/**
 * Descuenta stock según armado de lavado.
 * - Sin receta: no-op (skipped).
 * - Ya consumido: skipped (idempotente).
 * - Stock insuficiente: lanza Error.
 */
export async function consumeStockForWash(params: {
  appointmentId: number;
  code: string;
  vehicles: Array<{ type: string }>;
  movementDate: string;
}): Promise<WashConsumeResult> {
  if (await wasConsumed(params.appointmentId)) {
    return { skipped: true, reason: "already_consumed", movements: [] };
  }

  const recipes = await getWashRecipes();
  if (!recipeHasLines(recipes)) {
    return { skipped: true, reason: "no_recipe", movements: [] };
  }

  const plan = expandWashConsumption(recipes, params.vehicles);
  if (plan.length === 0) {
    await markConsumed(params.appointmentId, `sin líneas · ${params.code}`);
    return { skipped: true, reason: "empty_plan", movements: [] };
  }

  // Validar stock antes de descontar
  const items = await inventoryDb.listInventoryItems({ includeInactive: true });
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const step of plan) {
    const item = byId.get(step.itemId);
    if (!item || !item.active) {
      throw new Error(
        `Insumo #${step.itemId} de la receta no existe o está inactivo. Revisá Armado de lavado.`
      );
    }
    if (item.stock < step.quantity) {
      throw new Error(
        `Stock insuficiente de "${item.name}": hay ${item.stock} ${item.unit}, se necesitan ${step.quantity} para el lavado ${params.code}. Cargá insumos o ajustá la receta.`
      );
    }
  }

  const movements: StockMovement[] = [];
  for (const step of plan) {
    const item = byId.get(step.itemId)!;
    const { movement } = await inventoryDb.applyStockMovement({
      itemId: step.itemId,
      type: "salida",
      quantity: step.quantity,
      movementDate: params.movementDate,
      notes: `Lavado ${params.code} · ${step.vehicleCount}× consumo · ${item.name}`,
    });
    movements.push(movement);
  }

  await markConsumed(
    params.appointmentId,
    `Lavado ${params.code} · ${movements.length} movimiento(s)`
  );

  return { skipped: false, movements };
}
