/**
 * Cuentas por cobrar / deudores (ERP). Independiente de agenda (aún).
 */
import { desc, eq } from "drizzle-orm";
import { get as getBlob, put as putBlob } from "@vercel/blob";
import { receivables as receivablesTable } from "../drizzle/schema";
import {
  computeReceivableStats,
  deriveReceivableStatus,
  type Receivable,
  type ReceivableInput,
  type ReceivableStatus,
} from "../shared/receivables";
import { getDb } from "./db";

const BLOB_PATH = "555-detail-agenda/data/receivables.json";

function isBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readBlob(): Promise<Receivable[]> {
  const result = await getBlob(BLOB_PATH, { access: "private", useCache: false });
  if (!result?.stream) return [];
  try {
    const parsed = JSON.parse(await new Response(result.stream).text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeBlob(rows: Receivable[]) {
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

function sanitize(input: ReceivableInput): Omit<Receivable, "id" | "createdAt" | "updatedAt"> {
  const clientName = String(input.clientName || "").trim();
  if (!clientName) throw new Error("Indicá el cliente");
  const concept = String(input.concept || "").trim();
  if (!concept) throw new Error("Indicá el concepto");
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Monto inválido");
  const amountPaid = Math.max(0, Math.round(Number(input.amountPaid ?? 0)) || 0);
  if (amountPaid > amount) throw new Error("Lo cobrado no puede superar el total");
  const dueDate = String(input.dueDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("Fecha inválida");
  const draft = {
    clientName,
    clientPhone: String(input.clientPhone || "").trim(),
    concept,
    amount,
    amountPaid,
    dueDate,
    status: (input.status || "pendiente") as ReceivableStatus,
    notes: String(input.notes || "").trim(),
  };
  return { ...draft, status: deriveReceivableStatus(draft) };
}

function fromSql(row: typeof receivablesTable.$inferSelect): Receivable {
  const base: Receivable = {
    id: row.id,
    clientName: row.clientName,
    clientPhone: row.clientPhone || "",
    concept: row.concept,
    amount: row.amount,
    amountPaid: row.amountPaid,
    dueDate: row.dueDate,
    status: row.status,
    notes: row.notes || "",
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  };
  return { ...base, status: deriveReceivableStatus(base) };
}

export async function listReceivables() {
  if (isBlob()) {
    const rows = await readBlob();
    return rows
      .map((r) => ({ ...r, status: deriveReceivableStatus(r) }))
      .sort((a, b) => String(b.dueDate).localeCompare(String(a.dueDate)));
  }
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(receivablesTable).orderBy(desc(receivablesTable.dueDate));
  return rows.map(fromSql);
}

export async function createReceivable(input: ReceivableInput) {
  const data = sanitize(input);
  const now = new Date().toISOString();
  if (isBlob()) {
    return withLock(async () => {
      const rows = await readBlob();
      const row: Receivable = { id: nextId(rows), ...data, createdAt: now, updatedAt: now };
      rows.push(row);
      await writeBlob(rows);
      return row;
    });
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.insert(receivablesTable).values({
    clientName: data.clientName,
    clientPhone: data.clientPhone,
    concept: data.concept,
    amount: data.amount,
    amountPaid: data.amountPaid,
    dueDate: data.dueDate,
    status: data.status,
    notes: data.notes || null,
  });
  const created = await db.select().from(receivablesTable).orderBy(desc(receivablesTable.id)).limit(1);
  if (!created[0]) throw new Error("No se pudo crear la deuda");
  return fromSql(created[0]);
}

export async function updateReceivable(id: number, input: Partial<ReceivableInput>) {
  if (isBlob()) {
    return withLock(async () => {
      const rows = await readBlob();
      const idx = rows.findIndex((r) => r.id === id);
      if (idx < 0) throw new Error("Deuda no encontrada");
      const prev = rows[idx];
      const merged = sanitize({
        clientName: input.clientName ?? prev.clientName,
        clientPhone: input.clientPhone !== undefined ? input.clientPhone : prev.clientPhone,
        concept: input.concept ?? prev.concept,
        amount: input.amount !== undefined ? input.amount : prev.amount,
        amountPaid: input.amountPaid !== undefined ? input.amountPaid : prev.amountPaid,
        dueDate: input.dueDate ?? prev.dueDate,
        status: input.status ?? prev.status,
        notes: input.notes !== undefined ? input.notes : prev.notes,
      });
      rows[idx] = { ...prev, ...merged, updatedAt: new Date().toISOString() };
      await writeBlob(rows);
      return rows[idx];
    });
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const existing = await db.select().from(receivablesTable).where(eq(receivablesTable.id, id)).limit(1);
  if (!existing[0]) throw new Error("Deuda no encontrada");
  const prev = fromSql(existing[0]);
  const merged = sanitize({
    clientName: input.clientName ?? prev.clientName,
    clientPhone: input.clientPhone !== undefined ? input.clientPhone : prev.clientPhone,
    concept: input.concept ?? prev.concept,
    amount: input.amount !== undefined ? input.amount : prev.amount,
    amountPaid: input.amountPaid !== undefined ? input.amountPaid : prev.amountPaid,
    dueDate: input.dueDate ?? prev.dueDate,
    status: input.status ?? prev.status,
    notes: input.notes !== undefined ? input.notes : prev.notes,
  });
  await db
    .update(receivablesTable)
    .set({
      clientName: merged.clientName,
      clientPhone: merged.clientPhone,
      concept: merged.concept,
      amount: merged.amount,
      amountPaid: merged.amountPaid,
      dueDate: merged.dueDate,
      status: merged.status,
      notes: merged.notes || null,
    })
    .where(eq(receivablesTable.id, id));
  const updated = await db.select().from(receivablesTable).where(eq(receivablesTable.id, id)).limit(1);
  return fromSql(updated[0]);
}

export async function registerReceivablePayment(id: number, payAmount: number) {
  const amount = Math.round(Number(payAmount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Monto de cobro inválido");
  if (isBlob()) {
    return withLock(async () => {
      const rows = await readBlob();
      const idx = rows.findIndex((r) => r.id === id);
      if (idx < 0) throw new Error("Deuda no encontrada");
      const prev = rows[idx];
      if (prev.status === "anulado") throw new Error("Deuda anulada");
      const amountPaid = Math.min(prev.amount, prev.amountPaid + amount);
      const merged = sanitize({
        ...prev,
        amountPaid,
      });
      rows[idx] = { ...prev, ...merged, updatedAt: new Date().toISOString() };
      await writeBlob(rows);
      return rows[idx];
    });
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const existing = await db.select().from(receivablesTable).where(eq(receivablesTable.id, id)).limit(1);
  if (!existing[0]) throw new Error("Deuda no encontrada");
  const prev = fromSql(existing[0]);
  if (prev.status === "anulado") throw new Error("Deuda anulada");
  return updateReceivable(id, { amountPaid: Math.min(prev.amount, prev.amountPaid + amount) });
}

export async function getReceivableStats() {
  return computeReceivableStats(await listReceivables());
}
