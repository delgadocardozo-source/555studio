/**
 * Comprobantes de servicio. Blob en Vercel, MySQL en el resto.
 * El cobro sigue viviendo en el turno (pagado / falta_pagar).
 */
import { desc, eq } from "drizzle-orm";
import { get as getBlob, put as putBlob } from "@vercel/blob";
import { serviceInvoices } from "../drizzle/schema";
import {
  assertVoidReason,
  buildInvoiceDraft,
  computeInvoiceStats,
  nextInvoiceNumber,
  type InvoiceAppointmentSource,
  type InvoiceLine,
  type InvoiceListStats,
  type ServiceInvoice,
} from "../shared/invoicing";
import { getAppointmentById, getDb, listAppointments } from "./db";

const BLOB_PATH = "555-detail-agenda/data/service-invoices.json";

function isVercelBlobRuntime() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export interface ServiceInvoiceView extends ServiceInvoice {
  paymentStatus: string;
}

async function readBlob(): Promise<ServiceInvoice[]> {
  const result = await getBlob(BLOB_PATH, { access: "private", useCache: false });
  if (!result || !result.stream) return [];
  try {
    const text = await new Response(result.stream).text();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as ServiceInvoice[]) : [];
  } catch {
    return [];
  }
}

async function writeBlob(rows: ServiceInvoice[]) {
  await putBlob(BLOB_PATH, JSON.stringify(rows), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
}

let writeChain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function parseLines(raw: unknown): InvoiceLine[] {
  if (Array.isArray(raw)) return raw as InvoiceLine[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as InvoiceLine[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function fromSql(row: typeof serviceInvoices.$inferSelect): ServiceInvoice {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    issuedDate: row.issuedDate,
    appointmentId: row.appointmentId,
    appointmentCode: row.appointmentCode,
    clientName: row.clientName,
    clientPhone: row.clientPhone || "",
    clientTaxId: row.clientTaxId || "",
    companyName: row.companyName || "",
    lines: parseLines(row.linesJson),
    total: row.total,
    taxableBase: row.taxableBase,
    ivaAmount: row.ivaAmount,
    voidReason: row.voidReason || "",
    voidedAt: row.voidedAt || null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ""),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ""),
  };
}

async function readAll(): Promise<ServiceInvoice[]> {
  if (isVercelBlobRuntime()) return readBlob();
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(serviceInvoices).orderBy(desc(serviceInvoices.id));
  return rows.map(fromSql);
}

async function paymentMap(): Promise<Map<number, string>> {
  const rows = await listAppointments({});
  return new Map(rows.map((row) => [row.id, String(row.paymentStatus || "")]));
}

function withPayment(rows: ServiceInvoice[], payments: Map<number, string>): ServiceInvoiceView[] {
  return rows
    .map((row) => ({
      ...row,
      paymentStatus: payments.get(row.appointmentId) || "sin_definir",
    }))
    .sort((a, b) => b.number.localeCompare(a.number));
}

export async function listInvoices(): Promise<ServiceInvoiceView[]> {
  const [rows, payments] = await Promise.all([readAll(), paymentMap()]);
  return withPayment(rows, payments);
}

export async function getInvoiceStats(): Promise<InvoiceListStats> {
  const [rows, payments] = await Promise.all([readAll(), paymentMap()]);
  return computeInvoiceStats(rows, payments);
}

/** Turnos finalizados con monto, sin comprobante vigente. */
export async function listBillableAppointments() {
  const [appointments, invoices] = await Promise.all([listAppointments({}), readAll()]);
  const blocked = new Set(
    invoices.filter((inv) => inv.status === "emitida").map((inv) => inv.appointmentId)
  );
  return appointments
    .filter((row) => row.status === "finalizado" && !blocked.has(row.id))
    .filter((row) => Math.round(Number(row.servicePrice) || 0) > 0)
    .sort((a, b) => String(b.scheduledDate).localeCompare(String(a.scheduledDate)))
    .slice(0, 40)
    .map((row) => ({
      id: row.id,
      code: row.code,
      clientName: row.clientName,
      clientPhone: row.clientPhone,
      clientTaxId: row.clientTaxId || "",
      scheduledDate: row.scheduledDate,
      servicePrice: row.servicePrice,
      paymentStatus: row.paymentStatus,
    }));
}

export async function issueInvoice(appointmentId: number, issuedDate?: string): Promise<ServiceInvoice> {
  const date = issuedDate || new Date().toISOString().slice(0, 10);
  return withLock(async () => {
    const appointment = (await getAppointmentById(appointmentId)) as InvoiceAppointmentSource | undefined;
    if (!appointment) throw new Error("Turno no encontrado");
    if (isVercelBlobRuntime()) {
      const rows = await readBlob();
      const draft = buildInvoiceDraft(appointment, rows, date);
      const now = new Date().toISOString();
      const created: ServiceInvoice = {
        id: rows.reduce((max, row) => Math.max(max, row.id), 0) + 1,
        number: nextInvoiceNumber(rows.map((row) => row.number)),
        status: "emitida",
        voidReason: "",
        voidedAt: null,
        createdAt: now,
        updatedAt: now,
        ...draft,
      };
      rows.push(created);
      await writeBlob(rows);
      return created;
    }

    const existing = await readAll();
    const draft = buildInvoiceDraft(appointment, existing, date);
    const number = nextInvoiceNumber(existing.map((row) => row.number));
    const db = await getDb();
    if (!db) throw new Error("Base de datos no disponible");
    await db.insert(serviceInvoices).values({
      number,
      status: "emitida",
      issuedDate: draft.issuedDate,
      appointmentId: draft.appointmentId,
      appointmentCode: draft.appointmentCode,
      clientName: draft.clientName,
      clientPhone: draft.clientPhone,
      clientTaxId: draft.clientTaxId || null,
      companyName: draft.companyName || null,
      linesJson: JSON.stringify(draft.lines),
      total: draft.total,
      taxableBase: draft.taxableBase,
      ivaAmount: draft.ivaAmount,
      voidReason: null,
      voidedAt: null,
    });
    const saved = await db
      .select()
      .from(serviceInvoices)
      .where(eq(serviceInvoices.number, number))
      .limit(1);
    if (!saved[0]) throw new Error("No se pudo emitir el comprobante");
    return fromSql(saved[0]);
  });
}

export async function voidInvoice(id: number, reason: string): Promise<ServiceInvoice> {
  const clean = assertVoidReason(reason);
  return withLock(async () => {
    const now = new Date().toISOString();
    if (isVercelBlobRuntime()) {
      const rows = await readBlob();
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) throw new Error("Comprobante no encontrado");
      if (rows[index].status === "anulada") throw new Error("El comprobante ya está anulado");
      rows[index] = {
        ...rows[index],
        status: "anulada",
        voidReason: clean,
        voidedAt: now,
        updatedAt: now,
      };
      await writeBlob(rows);
      return rows[index];
    }

    const db = await getDb();
    if (!db) throw new Error("Base de datos no disponible");
    const current = await db.select().from(serviceInvoices).where(eq(serviceInvoices.id, id)).limit(1);
    if (!current[0]) throw new Error("Comprobante no encontrado");
    if (current[0].status === "anulada") throw new Error("El comprobante ya está anulado");
    await db
      .update(serviceInvoices)
      .set({ status: "anulada", voidReason: clean, voidedAt: now })
      .where(eq(serviceInvoices.id, id));
    const saved = await db.select().from(serviceInvoices).where(eq(serviceInvoices.id, id)).limit(1);
    return fromSql(saved[0]);
  });
}
