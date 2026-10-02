/**
 * Inventario de insumos (ERP). Independiente de agenda.
 */
import { desc, eq } from "drizzle-orm";
import { get as getBlob, put as putBlob } from "@vercel/blob";
import {
  computeInventoryStats,
  type InventoryItem,
  type InventoryItemInput,
  type StockMovement,
  type StockMovementInput,
  type StockMovementType,
} from "../shared/inventory";
import { getDb } from "./db";
import { inventoryItems, stockMovements } from "../drizzle/schema";

const BLOB_PATH = "555-detail-agenda/data/inventory.json";

type BlobStore = { items: InventoryItem[]; movements: StockMovement[] };

function isBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readBlob(): Promise<BlobStore> {
  const result = await getBlob(BLOB_PATH, { access: "private", useCache: false });
  if (!result?.stream) return { items: [], movements: [] };
  try {
    const parsed = JSON.parse(await new Response(result.stream).text());
    return {
      items: Array.isArray(parsed?.items) ? parsed.items : [],
      movements: Array.isArray(parsed?.movements) ? parsed.movements : [],
    };
  } catch {
    return { items: [], movements: [] };
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

function nextId(rows: Array<{ id: number }>) {
  return rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
}

function sanitizeItem(input: InventoryItemInput): Omit<InventoryItem, "id" | "createdAt" | "updatedAt"> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Indicá el nombre del insumo");
  const stock = Math.max(0, Math.round(Number(input.stock ?? 0)) || 0);
  const minStock = Math.max(0, Math.round(Number(input.minStock ?? 0)) || 0);
  let unitCost: number | null = null;
  if (input.unitCost != null && String(input.unitCost) !== "") {
    const n = Math.round(Number(input.unitCost));
    if (!Number.isFinite(n) || n < 0) throw new Error("Costo unitario inválido");
    unitCost = n;
  }
  return {
    name,
    category: String(input.category || "Otros").trim() || "Otros",
    unit: String(input.unit || "unid").trim() || "unid",
    stock,
    minStock,
    unitCost,
    notes: String(input.notes || "").trim(),
    active: input.active === false ? false : true,
  };
}

function itemFromSql(row: typeof inventoryItems.$inferSelect): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    stock: row.stock,
    minStock: row.minStock,
    unitCost: row.unitCost ?? null,
    notes: row.notes || "",
    active: Number(row.active) === 1,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  };
}

function movFromSql(row: typeof stockMovements.$inferSelect): StockMovement {
  return {
    id: row.id,
    itemId: row.itemId,
    itemName: row.itemName,
    type: row.type as StockMovementType,
    quantity: row.quantity,
    movementDate: row.movementDate,
    notes: row.notes || "",
    stockAfter: row.stockAfter,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
  };
}

export async function listInventoryItems(params?: { includeInactive?: boolean }) {
  if (isBlob()) {
    const { items } = await readBlob();
    const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
    return params?.includeInactive ? sorted : sorted.filter((i) => i.active);
  }
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(inventoryItems).orderBy(inventoryItems.name);
  const mapped = rows.map(itemFromSql);
  return params?.includeInactive ? mapped : mapped.filter((i) => i.active);
}

export async function createInventoryItem(input: InventoryItemInput) {
  const data = sanitizeItem(input);
  const now = new Date().toISOString();
  if (isBlob()) {
    return withLock(async () => {
      const store = await readBlob();
      const row: InventoryItem = { id: nextId(store.items), ...data, createdAt: now, updatedAt: now };
      store.items.push(row);
      await writeBlob(store);
      return row;
    });
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.insert(inventoryItems).values({
    name: data.name,
    category: data.category,
    unit: data.unit,
    stock: data.stock,
    minStock: data.minStock,
    unitCost: data.unitCost,
    notes: data.notes || null,
    active: data.active ? 1 : 0,
  });
  const created = await db
    .select()
    .from(inventoryItems)
    .where(eq(inventoryItems.name, data.name))
    .orderBy(desc(inventoryItems.id))
    .limit(1);
  if (!created[0]) throw new Error("No se pudo crear el ítem");
  return itemFromSql(created[0]);
}

export async function updateInventoryItem(id: number, input: Partial<InventoryItemInput>) {
  if (isBlob()) {
    return withLock(async () => {
      const store = await readBlob();
      const idx = store.items.findIndex((i) => i.id === id);
      if (idx < 0) throw new Error("Ítem no encontrado");
      const prev = store.items[idx];
      const merged = sanitizeItem({
        name: input.name ?? prev.name,
        category: input.category ?? prev.category,
        unit: input.unit ?? prev.unit,
        stock: input.stock !== undefined ? input.stock : prev.stock,
        minStock: input.minStock !== undefined ? input.minStock : prev.minStock,
        unitCost: input.unitCost !== undefined ? input.unitCost : prev.unitCost,
        notes: input.notes !== undefined ? input.notes : prev.notes,
        active: input.active !== undefined ? input.active : prev.active,
      });
      store.items[idx] = { ...prev, ...merged, updatedAt: new Date().toISOString() };
      await writeBlob(store);
      return store.items[idx];
    });
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const existing = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);
  if (!existing[0]) throw new Error("Ítem no encontrado");
  const prev = itemFromSql(existing[0]);
  const merged = sanitizeItem({
    name: input.name ?? prev.name,
    category: input.category ?? prev.category,
    unit: input.unit ?? prev.unit,
    stock: input.stock !== undefined ? input.stock : prev.stock,
    minStock: input.minStock !== undefined ? input.minStock : prev.minStock,
    unitCost: input.unitCost !== undefined ? input.unitCost : prev.unitCost,
    notes: input.notes !== undefined ? input.notes : prev.notes,
    active: input.active !== undefined ? input.active : prev.active,
  });
  await db
    .update(inventoryItems)
    .set({
      name: merged.name,
      category: merged.category,
      unit: merged.unit,
      stock: merged.stock,
      minStock: merged.minStock,
      unitCost: merged.unitCost,
      notes: merged.notes || null,
      active: merged.active ? 1 : 0,
    })
    .where(eq(inventoryItems.id, id));
  const updated = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);
  return itemFromSql(updated[0]);
}

export async function listStockMovements(limit = 50) {
  if (isBlob()) {
    const { movements } = await readBlob();
    return [...movements]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit);
  }
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(stockMovements).orderBy(desc(stockMovements.id)).limit(limit);
  return rows.map(movFromSql);
}

export async function applyStockMovement(input: StockMovementInput) {
  const qty = Math.round(Number(input.quantity));
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("Cantidad inválida");
  const type = input.type;
  if (!["entrada", "salida", "ajuste"].includes(type)) throw new Error("Tipo inválido");
  const movementDate = String(input.movementDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate)) throw new Error("Fecha inválida");
  const notes = String(input.notes || "").trim();

  if (isBlob()) {
    return withLock(async () => {
      const store = await readBlob();
      const item = store.items.find((i) => i.id === input.itemId);
      if (!item) throw new Error("Ítem no encontrado");
      let nextStock = item.stock;
      if (type === "entrada") nextStock += qty;
      else if (type === "salida") nextStock -= qty;
      else nextStock = qty; // ajuste = set absolute
      if (nextStock < 0) throw new Error("Stock insuficiente");
      item.stock = nextStock;
      item.updatedAt = new Date().toISOString();
      const mov: StockMovement = {
        id: nextId(store.movements),
        itemId: item.id,
        itemName: item.name,
        type,
        quantity: qty,
        movementDate,
        notes,
        stockAfter: nextStock,
        createdAt: new Date().toISOString(),
      };
      store.movements.push(mov);
      await writeBlob(store);
      return { item, movement: mov };
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const rows = await db.select().from(inventoryItems).where(eq(inventoryItems.id, input.itemId)).limit(1);
  if (!rows[0]) throw new Error("Ítem no encontrado");
  let nextStock = rows[0].stock;
  if (type === "entrada") nextStock += qty;
  else if (type === "salida") nextStock -= qty;
  else nextStock = qty;
  if (nextStock < 0) throw new Error("Stock insuficiente");
  await db.update(inventoryItems).set({ stock: nextStock }).where(eq(inventoryItems.id, input.itemId));
  await db.insert(stockMovements).values({
    itemId: input.itemId,
    itemName: rows[0].name,
    type,
    quantity: qty,
    movementDate,
    notes: notes || null,
    stockAfter: nextStock,
  });
  const item = itemFromSql({ ...rows[0], stock: nextStock });
  const movRows = await db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.itemId, input.itemId))
    .orderBy(desc(stockMovements.id))
    .limit(1);
  return { item, movement: movFromSql(movRows[0]) };
}

export async function getInventoryStats() {
  const items = await listInventoryItems({ includeInactive: true });
  return computeInventoryStats(items);
}
