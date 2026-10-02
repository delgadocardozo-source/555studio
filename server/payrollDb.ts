/**
 * Persistencia de nómina (personal + pagos).
 * Módulo ERP aparte de agenda y de caja general.
 */
import { and, desc, eq, gte, like, lte, or } from "drizzle-orm";
import { get as getBlob, put as putBlob } from "@vercel/blob";
import { staffMembers, staffPayments } from "../drizzle/schema";
import {
  computePayrollStats,
  matchPaymentFilters,
  type PayrollFilters,
  type PayrollStats,
  type StaffMember,
  type StaffMemberInput,
  type StaffPayment,
  type StaffPaymentInput,
  type StaffPayType,
} from "../shared/payroll";
import { getDb } from "./db";

const BLOB_PAYROLL_PATH = "555-detail-agenda/data/payroll.json";

type PayrollBlob = {
  staff: StaffMember[];
  payments: StaffPayment[];
};

function isVercelBlobRuntime() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readBlobPayroll(): Promise<PayrollBlob> {
  const result = await getBlob(BLOB_PAYROLL_PATH, { access: "private", useCache: false });
  if (!result || !result.stream) return { staff: [], payments: [] };
  try {
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text);
    return {
      staff: Array.isArray(parsed?.staff) ? parsed.staff : [],
      payments: Array.isArray(parsed?.payments) ? parsed.payments : [],
    };
  } catch {
    return { staff: [], payments: [] };
  }
}

async function writeBlobPayroll(data: PayrollBlob) {
  await putBlob(BLOB_PAYROLL_PATH, JSON.stringify(data), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

let payrollWriteChain: Promise<unknown> = Promise.resolve();

function withPayrollLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = payrollWriteChain.then(fn, fn);
  payrollWriteChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function nextId(rows: Array<{ id: number }>): number {
  return rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
}

function sanitizeStaffInput(input: StaffMemberInput): Omit<StaffMember, "id" | "createdAt" | "updatedAt"> {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Indicá el nombre del personal");
  const payType = (input.payType || "quincenal") as StaffPayType;
  const allowed: StaffPayType[] = ["diario", "semanal", "quincenal", "mensual", "variable"];
  if (!allowed.includes(payType)) throw new Error("Tipo de pago inválido");
  let baseAmount: number | null = null;
  if (input.baseAmount != null && input.baseAmount !== ("" as any)) {
    const n = Math.round(Number(input.baseAmount));
    if (!Number.isFinite(n) || n < 0) throw new Error("Monto base inválido");
    baseAmount = n > 0 ? n : null;
  }
  return {
    name,
    role: String(input.role || "Lavador").trim() || "Lavador",
    payType,
    baseAmount,
    active: input.active === false ? false : true,
    notes: String(input.notes || "").trim(),
  };
}

function sortStaff(rows: StaffMember[]): StaffMember[] {
  return [...rows].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function sortPayments(rows: StaffPayment[]): StaffPayment[] {
  return [...rows].sort((a, b) => {
    const byDate = String(b.paymentDate).localeCompare(String(a.paymentDate));
    if (byDate !== 0) return byDate;
    return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
  });
}

function staffFromSql(row: typeof staffMembers.$inferSelect): StaffMember {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    payType: row.payType,
    baseAmount: row.baseAmount ?? null,
    active: Number(row.active) === 1,
    notes: row.notes || "",
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  };
}

function paymentFromSql(row: typeof staffPayments.$inferSelect): StaffPayment {
  return {
    id: row.id,
    staffId: row.staffId,
    staffName: row.staffName,
    amount: row.amount,
    paymentDate: row.paymentDate,
    concept: row.concept,
    notes: row.notes || "",
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  };
}

export async function listStaff(params?: { includeInactive?: boolean }): Promise<StaffMember[]> {
  if (isVercelBlobRuntime()) {
    const { staff } = await readBlobPayroll();
    const rows = sortStaff(staff);
    if (params?.includeInactive) return rows;
    return rows.filter((s) => s.active);
  }

  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(staffMembers).orderBy(staffMembers.name);
  const mapped = rows.map(staffFromSql);
  if (params?.includeInactive) return sortStaff(mapped);
  return sortStaff(mapped.filter((s) => s.active));
}

export async function createStaff(input: StaffMemberInput): Promise<StaffMember> {
  const data = sanitizeStaffInput(input);
  const now = new Date().toISOString();

  if (isVercelBlobRuntime()) {
    return withPayrollLock(async () => {
      const blob = await readBlobPayroll();
      const row: StaffMember = {
        id: nextId(blob.staff),
        ...data,
        createdAt: now,
        updatedAt: now,
      };
      blob.staff.push(row);
      await writeBlobPayroll(blob);
      return row;
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.insert(staffMembers).values({
    name: data.name,
    role: data.role,
    payType: data.payType,
    baseAmount: data.baseAmount,
    active: data.active ? 1 : 0,
    notes: data.notes || null,
  });
  const created = await db
    .select()
    .from(staffMembers)
    .where(eq(staffMembers.name, data.name))
    .orderBy(desc(staffMembers.id))
    .limit(1);
  if (!created[0]) throw new Error("No se pudo crear el personal");
  return staffFromSql(created[0]);
}

export async function updateStaff(
  id: number,
  input: Partial<StaffMemberInput>
): Promise<StaffMember> {
  if (isVercelBlobRuntime()) {
    return withPayrollLock(async () => {
      const blob = await readBlobPayroll();
      const index = blob.staff.findIndex((s) => s.id === id);
      if (index < 0) throw new Error("Personal no encontrado");
      const prev = blob.staff[index];
      const merged = sanitizeStaffInput({
        name: input.name ?? prev.name,
        role: input.role ?? prev.role,
        payType: input.payType ?? prev.payType,
        baseAmount: input.baseAmount !== undefined ? input.baseAmount : prev.baseAmount,
        active: input.active !== undefined ? input.active : prev.active,
        notes: input.notes !== undefined ? input.notes : prev.notes,
      });
      blob.staff[index] = {
        ...prev,
        ...merged,
        updatedAt: new Date().toISOString(),
      };
      if (merged.name !== prev.name) {
        const now = new Date().toISOString();
        blob.payments = blob.payments.map((p) =>
          p.staffId === id ? { ...p, staffName: merged.name, updatedAt: now } : p
        );
      }
      await writeBlobPayroll(blob);
      return blob.staff[index];
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const existing = await db.select().from(staffMembers).where(eq(staffMembers.id, id)).limit(1);
  if (!existing[0]) throw new Error("Personal no encontrado");
  const merged = sanitizeStaffInput({
    name: input.name ?? existing[0].name,
    role: input.role ?? existing[0].role,
    payType: (input.payType ?? existing[0].payType) as StaffPayType,
    baseAmount:
      input.baseAmount !== undefined ? input.baseAmount : existing[0].baseAmount,
    active: input.active !== undefined ? input.active : Number(existing[0].active) === 1,
    notes: input.notes !== undefined ? input.notes : existing[0].notes || "",
  });
  await db
    .update(staffMembers)
    .set({
      name: merged.name,
      role: merged.role,
      payType: merged.payType,
      baseAmount: merged.baseAmount,
      active: merged.active ? 1 : 0,
      notes: merged.notes || null,
    })
    .where(eq(staffMembers.id, id));
  if (merged.name !== existing[0].name) {
    await db
      .update(staffPayments)
      .set({ staffName: merged.name })
      .where(eq(staffPayments.staffId, id));
  }
  const updated = await db.select().from(staffMembers).where(eq(staffMembers.id, id)).limit(1);
  return staffFromSql(updated[0]);
}

export async function listPayments(filters: PayrollFilters = {}): Promise<StaffPayment[]> {
  if (isVercelBlobRuntime()) {
    const { payments } = await readBlobPayroll();
    return sortPayments(payments.filter((p) => matchPaymentFilters(p, filters)));
  }

  const db = await getDb();
  if (!db) return [];
  const conditions = [];
  if (filters.staffId != null) conditions.push(eq(staffPayments.staffId, filters.staffId));
  if (filters.dateFrom) conditions.push(gte(staffPayments.paymentDate, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(staffPayments.paymentDate, filters.dateTo));
  if (filters.concept && filters.concept !== "Todos") {
    conditions.push(eq(staffPayments.concept, filters.concept));
  }
  if (filters.search?.trim()) {
    const q = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        like(staffPayments.staffName, q),
        like(staffPayments.concept, q),
        like(staffPayments.notes, q)
      )
    );
  }
  const query = db.select().from(staffPayments).orderBy(desc(staffPayments.paymentDate));
  const rows = conditions.length ? await query.where(and(...conditions)) : await query;
  return rows.map(paymentFromSql);
}

export async function createPayment(input: StaffPaymentInput): Promise<StaffPayment> {
  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("El monto debe ser mayor a 0");
  }
  const paymentDate = String(input.paymentDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    throw new Error("Fecha inválida (YYYY-MM-DD)");
  }
  const concept = String(input.concept || "").trim() || "Otro";
  const notes = String(input.notes || "").trim();
  const staffId = Number(input.staffId);
  if (!Number.isFinite(staffId) || staffId <= 0) throw new Error("Seleccioná el personal");

  if (isVercelBlobRuntime()) {
    return withPayrollLock(async () => {
      const blob = await readBlobPayroll();
      const staff = blob.staff.find((s) => s.id === staffId);
      if (!staff) throw new Error("Personal no encontrado");
      if (!staff.active) throw new Error("Ese personal está inactivo");
      const now = new Date().toISOString();
      const row: StaffPayment = {
        id: nextId(blob.payments),
        staffId,
        staffName: staff.name,
        amount,
        paymentDate,
        concept,
        notes,
        createdAt: now,
        updatedAt: now,
      };
      blob.payments.push(row);
      await writeBlobPayroll(blob);
      return row;
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const staffRows = await db.select().from(staffMembers).where(eq(staffMembers.id, staffId)).limit(1);
  if (!staffRows[0]) throw new Error("Personal no encontrado");
  if (Number(staffRows[0].active) !== 1) throw new Error("Ese personal está inactivo");
  await db.insert(staffPayments).values({
    staffId,
    staffName: staffRows[0].name,
    amount,
    paymentDate,
    concept,
    notes: notes || null,
  });
  const created = await db
    .select()
    .from(staffPayments)
    .where(eq(staffPayments.staffId, staffId))
    .orderBy(desc(staffPayments.id))
    .limit(1);
  if (!created[0]) throw new Error("No se pudo registrar el pago");
  return paymentFromSql(created[0]);
}

export async function deletePayment(id: number): Promise<{ success: true }> {
  if (isVercelBlobRuntime()) {
    return withPayrollLock(async () => {
      const blob = await readBlobPayroll();
      const before = blob.payments.length;
      blob.payments = blob.payments.filter((p) => p.id !== id);
      if (blob.payments.length === before) throw new Error("Pago no encontrado");
      await writeBlobPayroll(blob);
      return { success: true as const };
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.delete(staffPayments).where(eq(staffPayments.id, id));
  return { success: true };
}

export async function getPayrollStats(filters: PayrollFilters = {}): Promise<PayrollStats> {
  const staff = await listStaff({ includeInactive: true });
  const payments = await listPayments(filters);
  return computePayrollStats(staff, payments);
}
