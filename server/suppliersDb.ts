/**
 * Proveedores (ERP). Independiente de agenda.
 */
import { desc, eq } from "drizzle-orm";
import { get as getBlob, put as putBlob } from "@vercel/blob";
import { suppliers as suppliersTable } from "../drizzle/schema";
import {
  matchSupplierSearch,
  type Supplier,
  type SupplierInput,
} from "../shared/suppliers";
import { getDb } from "./db";

const BLOB_PATH = "555-detail-agenda/data/suppliers.json";

function isBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readBlob(): Promise<Supplier[]> {
  const result = await getBlob(BLOB_PATH, { access: "private", useCache: false });
  if (!result?.stream) return [];
  try {
    const parsed = JSON.parse(await new Response(result.stream).text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeBlob(rows: Supplier[]) {
  await putBlob(BLOB_PATH, JSON.stringify(rows), {
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

function sanitize(input: SupplierInput): Omit<Supplier, "id" | "createdAt" | "updatedAt"> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Indicá el nombre del proveedor");
  return {
    name,
    phone: String(input.phone || "").trim(),
    category: String(input.category || "Otros").trim() || "Otros",
    notes: String(input.notes || "").trim(),
    active: input.active === false ? false : true,
  };
}

function fromSql(row: typeof suppliersTable.$inferSelect): Supplier {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || "",
    category: row.category,
    notes: row.notes || "",
    active: Number(row.active) === 1,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  };
}

export async function listSuppliers(params?: { includeInactive?: boolean; search?: string }) {
  if (isBlob()) {
    let rows = await readBlob();
    if (!params?.includeInactive) rows = rows.filter((r) => r.active);
    rows = rows.filter((r) => matchSupplierSearch(r, params?.search));
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }
  const db = await getDb();
  if (!db) return [];
  const rows = (await db.select().from(suppliersTable).orderBy(suppliersTable.name)).map(fromSql);
  return rows
    .filter((r) => (params?.includeInactive ? true : r.active))
    .filter((r) => matchSupplierSearch(r, params?.search));
}

export async function createSupplier(input: SupplierInput) {
  const data = sanitize(input);
  const now = new Date().toISOString();
  if (isBlob()) {
    return withLock(async () => {
      const rows = await readBlob();
      const row: Supplier = { id: nextId(rows), ...data, createdAt: now, updatedAt: now };
      rows.push(row);
      await writeBlob(rows);
      return row;
    });
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.insert(suppliersTable).values({
    name: data.name,
    phone: data.phone,
    category: data.category,
    notes: data.notes || null,
    active: data.active ? 1 : 0,
  });
  const created = await db
    .select()
    .from(suppliersTable)
    .where(eq(suppliersTable.name, data.name))
    .orderBy(desc(suppliersTable.id))
    .limit(1);
  if (!created[0]) throw new Error("No se pudo crear el proveedor");
  return fromSql(created[0]);
}

export async function updateSupplier(id: number, input: Partial<SupplierInput>) {
  if (isBlob()) {
    return withLock(async () => {
      const rows = await readBlob();
      const idx = rows.findIndex((r) => r.id === id);
      if (idx < 0) throw new Error("Proveedor no encontrado");
      const prev = rows[idx];
      const merged = sanitize({
        name: input.name ?? prev.name,
        phone: input.phone !== undefined ? input.phone : prev.phone,
        category: input.category ?? prev.category,
        notes: input.notes !== undefined ? input.notes : prev.notes,
        active: input.active !== undefined ? input.active : prev.active,
      });
      rows[idx] = { ...prev, ...merged, updatedAt: new Date().toISOString() };
      await writeBlob(rows);
      return rows[idx];
    });
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const existing = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id)).limit(1);
  if (!existing[0]) throw new Error("Proveedor no encontrado");
  const prev = fromSql(existing[0]);
  const merged = sanitize({
    name: input.name ?? prev.name,
    phone: input.phone !== undefined ? input.phone : prev.phone,
    category: input.category ?? prev.category,
    notes: input.notes !== undefined ? input.notes : prev.notes,
    active: input.active !== undefined ? input.active : prev.active,
  });
  await db
    .update(suppliersTable)
    .set({
      name: merged.name,
      phone: merged.phone,
      category: merged.category,
      notes: merged.notes || null,
      active: merged.active ? 1 : 0,
    })
    .where(eq(suppliersTable.id, id));
  const updated = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id)).limit(1);
  return fromSql(updated[0]);
}
