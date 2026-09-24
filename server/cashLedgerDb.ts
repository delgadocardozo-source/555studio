/**
 * Persistencia del libro de caja (ingresos / egresos).
 * Módulo aparte de agenda/logística (appointments / customers).
 */
import { and, desc, eq, gte, like, lte, or } from "drizzle-orm";
import { get as getBlob, put as putBlob } from "@vercel/blob";
import { cashMovements } from "../drizzle/schema";
import {
  computeCashStats,
  matchCashFilters,
  type CashLedgerFilters,
  type CashLedgerStats,
  type CashMovement,
  type CashMovementInput,
} from "../shared/cashLedger";
import { getDb } from "./db";

const BLOB_CASH_PATH = "555-detail-agenda/data/cash-movements.json";

function isVercelBlobRuntime() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

type StoredCashMovement = CashMovement;

async function readBlobCash(): Promise<StoredCashMovement[]> {
  const result = await getBlob(BLOB_CASH_PATH, { access: "private", useCache: false });
  if (!result || !result.stream) return [];
  try {
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as StoredCashMovement[]) : [];
  } catch {
    return [];
  }
}

async function writeBlobCash(rows: StoredCashMovement[]) {
  await putBlob(BLOB_CASH_PATH, JSON.stringify(rows), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

let cashWriteChain: Promise<unknown> = Promise.resolve();

function withCashLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = cashWriteChain.then(fn, fn);
  cashWriteChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function sanitizeInput(input: CashMovementInput): Omit<CashMovement, "id" | "createdAt" | "updatedAt"> {
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("El monto debe ser un número mayor a 0");
  }
  const person = String(input.person || "").trim();
  if (!person) throw new Error("Indicá quién realizó el movimiento");
  const category = String(input.category || "").trim() || "Otros";
  const movementDate = String(input.movementDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(movementDate)) {
    throw new Error("Fecha inválida (YYYY-MM-DD)");
  }
  if (input.type !== "ingreso" && input.type !== "egreso") {
    throw new Error("Tipo inválido");
  }
  return {
    type: input.type,
    amount,
    movementDate,
    person,
    category,
    description: String(input.description || "").trim(),
  };
}

function sortCash(rows: StoredCashMovement[]): StoredCashMovement[] {
  return [...rows].sort((a, b) => {
    const byDate = String(b.movementDate).localeCompare(String(a.movementDate));
    if (byDate !== 0) return byDate;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

function rowFromSql(row: typeof cashMovements.$inferSelect): CashMovement {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    movementDate: row.movementDate,
    person: row.person,
    category: row.category,
    description: row.description || "",
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  };
}

export async function listCashMovements(filters: CashLedgerFilters = {}): Promise<CashMovement[]> {
  if (isVercelBlobRuntime()) {
    const rows = await readBlobCash();
    return sortCash(rows.filter((row) => matchCashFilters(row, filters)));
  }

  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters.type && filters.type !== "todos") {
    conditions.push(eq(cashMovements.type, filters.type));
  }
  if (filters.person?.trim()) {
    conditions.push(like(cashMovements.person, `%${filters.person.trim()}%`));
  }
  if (filters.category?.trim() && filters.category !== "Todas") {
    conditions.push(eq(cashMovements.category, filters.category.trim()));
  }
  if (filters.dateFrom) conditions.push(gte(cashMovements.movementDate, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(cashMovements.movementDate, filters.dateTo));
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        like(cashMovements.person, q),
        like(cashMovements.category, q),
        like(cashMovements.description, q)
      )
    );
  }

  const query = db
    .select()
    .from(cashMovements)
    .orderBy(desc(cashMovements.movementDate), desc(cashMovements.id));
  const rows =
    conditions.length > 0 ? await query.where(and(...conditions)) : await query;
  return rows.map(rowFromSql);
}

export async function getCashMovementById(id: number): Promise<CashMovement | undefined> {
  if (isVercelBlobRuntime()) {
    const rows = await readBlobCash();
    return rows.find((row) => row.id === id);
  }
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(cashMovements).where(eq(cashMovements.id, id)).limit(1);
  return rows[0] ? rowFromSql(rows[0]) : undefined;
}

export async function createCashMovement(input: CashMovementInput): Promise<CashMovement> {
  const payload = sanitizeInput(input);
  const nowIso = new Date().toISOString();

  if (isVercelBlobRuntime()) {
    return withCashLock(async () => {
      const rows = await readBlobCash();
      const created: CashMovement = {
        ...payload,
        id: rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      rows.push(created);
      await writeBlobCash(rows);
      return created;
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const result = await db.insert(cashMovements).values({
    type: payload.type,
    amount: payload.amount,
    movementDate: payload.movementDate,
    person: payload.person,
    category: payload.category,
    description: payload.description || null,
  });
  const insertId = Number((result as any)[0]?.insertId || (result as any).insertId || 0);
  const created = await getCashMovementById(insertId);
  if (!created) throw new Error("No se pudo crear el movimiento");
  return created;
}

export async function updateCashMovement(
  id: number,
  input: Partial<CashMovementInput>
): Promise<CashMovement> {
  if (isVercelBlobRuntime()) {
    return withCashLock(async () => {
      const rows = await readBlobCash();
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) throw new Error("Movimiento no encontrado");
      const merged = sanitizeInput({
        type: input.type ?? rows[index].type,
        amount: input.amount ?? rows[index].amount,
        movementDate: input.movementDate ?? rows[index].movementDate,
        person: input.person ?? rows[index].person,
        category: input.category ?? rows[index].category,
        description: input.description ?? rows[index].description,
      });
      rows[index] = {
        ...rows[index],
        ...merged,
        updatedAt: new Date().toISOString(),
      };
      await writeBlobCash(rows);
      return rows[index];
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const existing = await getCashMovementById(id);
  if (!existing) throw new Error("Movimiento no encontrado");
  const merged = sanitizeInput({
    type: input.type ?? existing.type,
    amount: input.amount ?? existing.amount,
    movementDate: input.movementDate ?? existing.movementDate,
    person: input.person ?? existing.person,
    category: input.category ?? existing.category,
    description: input.description ?? existing.description,
  });
  await db
    .update(cashMovements)
    .set({
      type: merged.type,
      amount: merged.amount,
      movementDate: merged.movementDate,
      person: merged.person,
      category: merged.category,
      description: merged.description || null,
    })
    .where(eq(cashMovements.id, id));
  const updated = await getCashMovementById(id);
  if (!updated) throw new Error("Movimiento no encontrado");
  return updated;
}

export async function deleteCashMovement(id: number): Promise<{ ok: true }> {
  if (isVercelBlobRuntime()) {
    return withCashLock(async () => {
      const rows = await readBlobCash();
      const next = rows.filter((row) => row.id !== id);
      if (next.length === rows.length) throw new Error("Movimiento no encontrado");
      await writeBlobCash(next);
      return { ok: true as const };
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.delete(cashMovements).where(eq(cashMovements.id, id));
  return { ok: true };
}

export async function getCashLedgerStats(filters: CashLedgerFilters = {}): Promise<CashLedgerStats> {
  const rows = await listCashMovements(filters);
  return computeCashStats(rows);
}

export async function listCashPersons(): Promise<string[]> {
  const rows = await listCashMovements({});
  const set = new Set<string>();
  for (const row of rows) {
    const p = (row.person || "").trim();
    if (p) set.add(p);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
}
