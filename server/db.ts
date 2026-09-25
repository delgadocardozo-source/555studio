import { and, desc, eq, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { get as getBlob, put as putBlob } from "@vercel/blob";
import { appointments, Appointment, InsertAppointment, customers, Customer, InsertCustomer, InsertUser, users } from "../drizzle/schema";
import {
  appointmentVehicleCount,
  dayHasOverlaps,
  findOverlappingPairs,
  packDaySchedule,
  ScheduleItem,
  timeSlotsOverlap,
  withNormalizedTimeSlot,
} from "../shared/scheduling";
import {
  computeManagerialStats,
  type ManagerialDateRange,
  type ManagerialDashboardStats,
} from "../shared/managerialStats";
import { ENV } from './_core/env';

export interface ServiceVehicleItem {
  type: "auto" | "camioneta";
  model: string;
  plate?: string | null;
  price: number;
}

export function parseAppointmentVehicles(row: StoredAppointment): ServiceVehicleItem[] {
  if (row.vehicles) {
    try {
      const parsed = typeof row.vehicles === "string" ? JSON.parse(row.vehicles) : row.vehicles;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // fallback below
    }
  }

  return [
    {
      type: row.vehicleType,
      model: row.vehicleModel,
      plate: row.licensePlate || null,
      price: row.servicePrice,
    },
  ];
}

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Vercel deployment uses Blob to persist the lightweight first-version agenda.
 * The original Manus deployment uses the SQL database transparently.
 */
const BLOB_APPOINTMENTS_PATH = "555-detail-agenda/data/appointments.json";
const BLOB_CUSTOMERS_PATH = "555-detail-agenda/data/customers.json";

function isVercelBlobRuntime() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

type StoredAppointment = Record<string, any>;

async function readBlobAppointments(): Promise<StoredAppointment[]> {
  // Pathname + useCache:false → lectura fresca (sin CDN de 60s)
  const result = await getBlob(BLOB_APPOINTMENTS_PATH, { access: "private", useCache: false });
  if (!result || !result.stream) return [];

  try {
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as StoredAppointment[];
  } catch {
    return [];
  }
}

/** Asegura timeSlot = inicio + N×80 (corrige franjas viejas de 90 min). */
function normalizeAppointmentRow(row: StoredAppointment): StoredAppointment {
  return withNormalizedTimeSlot(row);
}

function toScheduleItem(row: StoredAppointment): ScheduleItem {
  return {
    id: Number(row.id),
    timeSlot: String(row.timeSlot || ""),
    vehicleCount: appointmentVehicleCount(row),
    clientName: String(row.clientName || ""),
    status: row.status ?? null,
  };
}

/**
 * Si tras normalizar N×80 hay solapes el mismo día, empuja los turnos posteriores
 * para dejar la agenda consistente (sin huecos “libres” que mienten).
 */
function applyOverlapSanitization(rows: StoredAppointment[]): {
  rows: StoredAppointment[];
  changed: boolean;
  shifts: number;
} {
  const byDate = new Map<string, StoredAppointment[]>();
  for (const row of rows) {
    if (row.status === "cancelado") continue;
    const date = String(row.scheduledDate || "");
    if (!date) continue;
    const list = byDate.get(date) || [];
    list.push(row);
    byDate.set(date, list);
  }

  const slotUpdates = new Map<number, string>();
  let shiftCount = 0;

  for (const [, dayRows] of Array.from(byDate.entries())) {
    const items = dayRows.map(toScheduleItem);
    if (!dayHasOverlaps(items)) continue;
    const shifts = packDaySchedule(items);
    for (const shift of shifts) {
      slotUpdates.set(shift.id, shift.toSlot);
      shiftCount += 1;
    }
  }

  if (slotUpdates.size === 0) {
    return { rows, changed: false, shifts: 0 };
  }

  const next = rows.map((row) => {
    const toSlot = slotUpdates.get(Number(row.id));
    if (!toSlot || toSlot === row.timeSlot) return row;
    return normalizeAppointmentRow({
      ...row,
      timeSlot: toSlot,
      updatedAt: new Date().toISOString(),
    });
  });

  return { rows: next, changed: true, shifts: shiftCount };
}

async function readBlobAppointmentsNormalized(): Promise<StoredAppointment[]> {
  const rows = await readBlobAppointments();
  const normalized = rows.map(normalizeAppointmentRow);
  const sanitized = applyOverlapSanitization(normalized);
  const needsHeal =
    sanitized.changed ||
    normalized.some((row, i) => row.timeSlot !== rows[i]?.timeSlot);

  if (needsHeal) {
    void withAppointmentsLock(async () => {
      const fresh = await readBlobAppointments();
      const healed = fresh.map(normalizeAppointmentRow);
      const packed = applyOverlapSanitization(healed);
      const changed =
        packed.changed ||
        healed.some((row, i) => row.timeSlot !== fresh[i]?.timeSlot);
      if (changed) {
        console.info(
          `[appointments] Saneando agenda: N×80${packed.shifts ? ` + ${packed.shifts} empuje(s) por solape` : ""}`
        );
        await writeBlobAppointments(packed.rows);
      }
    }).catch((err) => {
      console.error("[appointments] No se pudo persistir saneamiento de agenda:", err?.message || err);
    });
  }

  return sanitized.rows;
}

/** Aplica shifts de empaque/empuje sobre Blob o SQL. */
export async function applyScheduleShifts(
  shifts: Array<{ id: number; timeSlot: string }>
): Promise<StoredAppointment[]> {
  if (shifts.length === 0) return [];

  if (isVercelBlobRuntime()) {
    return withAppointmentsLock(async () => {
      const rows = await readBlobAppointments();
      const updated: StoredAppointment[] = [];
      const now = new Date().toISOString();
      for (const shift of shifts) {
        const index = rows.findIndex((row) => Number(row.id) === shift.id);
        if (index < 0) continue;
        rows[index] = normalizeAppointmentRow({
          ...rows[index],
          timeSlot: shift.timeSlot,
          updatedAt: now,
        });
        updated.push(rows[index]);
      }
      await writeBlobAppointments(rows);
      return updated;
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  const updated: StoredAppointment[] = [];
  for (const shift of shifts) {
    await db
      .update(appointments)
      .set({ timeSlot: shift.timeSlot })
      .where(eq(appointments.id, shift.id));
    const row = await getAppointmentById(shift.id);
    if (row) updated.push(row as StoredAppointment);
  }
  return updated;
}

/** Sanea solapes de un día concreto y persiste. */
export async function sanitizeDaySchedule(date: string): Promise<{
  shiftsApplied: number;
  overlapsBefore: number;
}> {
  const rows = await listAppointments({ date });
  const items = rows.map((row) => toScheduleItem(row as StoredAppointment));
  const overlapsBefore = findOverlappingPairs(items).length;
  const shifts = packDaySchedule(items);
  if (shifts.length === 0) {
    return { shiftsApplied: 0, overlapsBefore };
  }

  await applyScheduleShifts(shifts.map((s) => ({ id: s.id, timeSlot: s.toSlot })));
  return { shiftsApplied: shifts.length, overlapsBefore };
}

async function putJsonBlob(pathname: string, rows: unknown[]) {
  await putBlob(pathname, JSON.stringify(rows), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    // Minimiza cache CDN (mínimo soportado) para que list/create vean datos frescos.
    cacheControlMaxAge: 60,
  });
}

async function writeBlobAppointments(rows: StoredAppointment[]) {
  await putJsonBlob(BLOB_APPOINTMENTS_PATH, rows);
}

/** Serializa RMW sobre el JSON de turnos (evita que un put pise otro). */
let appointmentsWriteChain: Promise<unknown> = Promise.resolve();

function withAppointmentsLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = appointmentsWriteChain.then(fn, fn);
  appointmentsWriteChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function normalizePhoneKey(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const withoutZero = digits.replace(/^0/, "");
  return withoutZero.startsWith("595") ? withoutZero : `595${withoutZero}`;
}

type StoredCustomer = Record<string, any>;

async function readBlobCustomers(): Promise<StoredCustomer[]> {
  const result = await getBlob(BLOB_CUSTOMERS_PATH, { access: "private", useCache: false });
  if (!result || !result.stream) return [];

  try {
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as StoredCustomer[];
  } catch {
    return [];
  }
}

async function writeBlobCustomers(rows: StoredCustomer[]) {
  await putJsonBlob(BLOB_CUSTOMERS_PATH, rows);
}

export interface UpsertCustomerProfileParams {
  clientName: string;
  clientPhone: string;
  clientType: "particular" | "oficina" | "empresa_flota";
  companyName?: string | null;
  clientTaxId?: string | null;
}

export async function upsertCustomerProfile(params: UpsertCustomerProfileParams) {
  const phoneKey = normalizePhoneKey(params.clientPhone);
  if (!phoneKey) return null;

  const payload = {
    phoneKey,
    clientName: params.clientName.trim(),
    clientPhone: params.clientPhone.trim(),
    clientType: params.clientType,
    companyName: params.companyName?.trim() || null,
    clientTaxId: params.clientTaxId?.trim() || null,
    lastUsedAt: new Date(),
  };

  if (isVercelBlobRuntime()) {
    const rows = await readBlobCustomers();
    const index = rows.findIndex((row) => row.phoneKey === phoneKey);
    const nowIso = new Date().toISOString();
    if (index >= 0) {
      rows[index] = {
        ...rows[index],
        ...payload,
        clientTaxId: payload.clientTaxId || rows[index].clientTaxId || null,
        companyName: payload.companyName || rows[index].companyName || null,
        updatedAt: nowIso,
        lastUsedAt: nowIso,
      };
      await writeBlobCustomers(rows);
      return rows[index];
    }

    const created = {
      ...payload,
      id: rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastUsedAt: nowIso,
    };
    rows.push(created);
    await writeBlobCustomers(rows);
    return created;
  }

  const db = await getDb();
  if (!db) return null;

  await db.insert(customers).values(payload).onDuplicateKeyUpdate({
    set: {
      clientName: payload.clientName,
      clientPhone: payload.clientPhone,
      clientType: payload.clientType,
      companyName: payload.companyName,
      clientTaxId: payload.clientTaxId || sql`COALESCE(values(clientTaxId), customers.clientTaxId)`,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const matched = await db.select().from(customers).where(eq(customers.phoneKey, phoneKey)).limit(1);
  return matched[0] ?? null;
}

export async function searchCustomers(query: string = "") {
  const clean = query.trim().toLowerCase();
  if (isVercelBlobRuntime()) {
    const rows = await readBlobCustomers();
    if (!clean) {
      return rows.sort((a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || ""))).slice(0, 20);
    }
    return rows
      .filter((row) => {
        const full = [row.clientName, row.clientPhone, row.companyName, row.clientTaxId, row.phoneKey]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return full.includes(clean);
      })
      .sort((a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || "")))
      .slice(0, 20);
  }

  const db = await getDb();
  if (!db) return [];

  if (!clean) {
    return await db.select().from(customers).orderBy(desc(customers.lastUsedAt)).limit(20);
  }

  const q = `%${clean}%`;
  return await db
    .select()
    .from(customers)
    .where(
      or(
        sql`${customers.clientName} LIKE ${q}`,
        sql`${customers.clientPhone} LIKE ${q}`,
        sql`${customers.companyName} LIKE ${q}`,
        sql`${customers.clientTaxId} LIKE ${q}`,
        sql`${customers.phoneKey} LIKE ${q}`
      )
    )
    .orderBy(desc(customers.lastUsedAt))
    .limit(20);
}

export async function findCustomerByPhone(phone: string) {
  const phoneKey = normalizePhoneKey(phone);
  if (!phoneKey) return null;

  if (isVercelBlobRuntime()) {
    const rows = await readBlobCustomers();
    return rows.find((row) => row.phoneKey === phoneKey) ?? null;
  }

  const db = await getDb();
  if (!db) return null;
  const matched = await db.select().from(customers).where(eq(customers.phoneKey, phoneKey)).limit(1);
  return matched[0] ?? null;
}

function matchFilters(row: StoredAppointment, filters: AppointmentFilters) {
  if (filters.date && row.scheduledDate !== filters.date) return false;
  if (filters.month && !String(row.scheduledDate).startsWith(filters.month)) return false;
  if (filters.status && row.status !== filters.status) return false;
  if (filters.paymentStatus && row.paymentStatus !== filters.paymentStatus) return false;
  if (filters.cityZone && row.cityZone !== filters.cityZone) return false;
  if (filters.vehicleType && row.vehicleType !== filters.vehicleType) return false;
  if (filters.clientType && row.clientType !== filters.clientType) return false;
  if (filters.search?.trim()) {
    const search = filters.search.trim().toLowerCase();
    const searchable = [
      row.clientName,
      row.clientPhone,
      row.clientTaxId,
      row.vehicleModel,
      row.licensePlate,
      row.code,
      row.address,
      row.companyName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!searchable.includes(search)) return false;
  }
  return true;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId || isVercelBlobRuntime()) return;

  const db = await getDb();
  if (!db) return;

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  if (isVercelBlobRuntime()) return undefined;
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export interface AppointmentFilters {
  date?: string;
  month?: string;
  status?: Appointment["status"];
  paymentStatus?: Appointment["paymentStatus"];
  cityZone?: Appointment["cityZone"];
  vehicleType?: Appointment["vehicleType"];
  clientType?: Appointment["clientType"];
  search?: string;
}

export async function listAppointments(filters: AppointmentFilters = {}) {
  if (isVercelBlobRuntime()) {
    const rows = await readBlobAppointmentsNormalized();
    return rows
      .filter((row) => matchFilters(row, filters))
      .sort((a, b) => `${b.scheduledDate} ${b.timeSlot}`.localeCompare(`${a.scheduledDate} ${a.timeSlot}`));
  }

  const db = await getDb();
  if (!db) return [];
  const conditions = [];

  if (filters.date) conditions.push(eq(appointments.scheduledDate, filters.date));
  else if (filters.month) conditions.push(sql`${appointments.scheduledDate} LIKE ${filters.month + "%"}`);
  if (filters.status) conditions.push(eq(appointments.status, filters.status));
  if (filters.paymentStatus) conditions.push(eq(appointments.paymentStatus, filters.paymentStatus));
  if (filters.cityZone) conditions.push(eq(appointments.cityZone, filters.cityZone));
  if (filters.vehicleType) conditions.push(eq(appointments.vehicleType, filters.vehicleType));
  if (filters.clientType) conditions.push(eq(appointments.clientType, filters.clientType));

  if (filters.search && filters.search.trim() !== "") {
    const q = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        sql`${appointments.clientName} LIKE ${q}`,
        sql`${appointments.clientPhone} LIKE ${q}`,
        sql`${appointments.vehicleModel} LIKE ${q}`,
        sql`${appointments.licensePlate} LIKE ${q}`,
        sql`${appointments.code} LIKE ${q}`,
        sql`${appointments.address} LIKE ${q}`,
        sql`${appointments.companyName} LIKE ${q}`,
        sql`${appointments.clientTaxId} LIKE ${q}`
      )
    );
  }

  const query = db.select().from(appointments).orderBy(desc(appointments.scheduledDate), appointments.timeSlot);
  const rows = conditions.length > 0 ? await query.where(and(...conditions)) : await query;
  return rows.map((row) => withNormalizedTimeSlot(row as StoredAppointment));
}

export async function getAppointmentById(id: number) {
  if (isVercelBlobRuntime()) {
    const rows = await readBlobAppointmentsNormalized();
    return rows.find((row) => row.id === id);
  }
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  return rows[0] ? withNormalizedTimeSlot(rows[0] as StoredAppointment) : undefined;
}

export async function createAppointment(data: Omit<InsertAppointment, "id" | "code" | "createdAt" | "updatedAt">) {
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const cleanDate = data.scheduledDate.replace(/-/g, "");
  const code = `555-${cleanDate}-${randomSuffix}`;

  if (isVercelBlobRuntime()) {
    return withAppointmentsLock(async () => {
      const rows = await readBlobAppointments();
      const created: StoredAppointment = normalizeAppointmentRow({
        ...data,
        id: rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1,
        code,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      rows.push(created);
      await writeBlobAppointments(rows);
      return created;
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.insert(appointments).values({ ...data, code });
  const created = await db.select().from(appointments).where(eq(appointments.code, code)).limit(1);
  return created[0];
}

export async function updateAppointmentStatus(id: number, status: Appointment["status"]) {
  if (isVercelBlobRuntime()) {
    return withAppointmentsLock(async () => {
      const rows = await readBlobAppointments();
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) throw new Error("Turno no encontrado");
      rows[index] = normalizeAppointmentRow({ ...rows[index], status, updatedAt: new Date().toISOString() });
      await writeBlobAppointments(rows);
      return rows[index];
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.update(appointments).set({ status }).where(eq(appointments.id, id));
  return await getAppointmentById(id);
}

export interface FinalizePaymentParams {
  id: number;
  paymentStatus: "pagado" | "falta_pagar";
  paymentMethod?: "efectivo" | "comprobante_digital";
  paymentReceiptUrl?: string | null;
  paymentReceiptName?: string | null;
}

export async function finalizeAppointmentWithPayment(params: FinalizePaymentParams) {
  if (params.paymentStatus === "pagado") {
    if (!params.paymentMethod) throw new Error("Debe seleccionar si el pago fue en efectivo o con comprobante digital");
    if (params.paymentMethod === "comprobante_digital" && !params.paymentReceiptUrl) {
      throw new Error("Es obligatorio adjuntar el comprobante de pago digital");
    }
  }

  const payload = {
    status: "finalizado" as const,
    paymentStatus: params.paymentStatus,
    paymentMethod: params.paymentStatus === "pagado" ? params.paymentMethod ?? null : null,
    paymentReceiptUrl: params.paymentStatus === "pagado" ? params.paymentReceiptUrl ?? null : null,
    paymentReceiptName: params.paymentStatus === "pagado" ? params.paymentReceiptName ?? null : null,
    paymentDeclaredAt: new Date(),
  };

  if (isVercelBlobRuntime()) {
    return withAppointmentsLock(async () => {
      const rows = await readBlobAppointments();
      const index = rows.findIndex((row) => row.id === params.id);
      if (index < 0) throw new Error("Turno no encontrado");
      rows[index] = normalizeAppointmentRow({ ...rows[index], ...payload, updatedAt: new Date().toISOString() });
      await writeBlobAppointments(rows);
      return rows[index];
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.update(appointments).set(payload).where(eq(appointments.id, params.id));
  return await getAppointmentById(params.id);
}

export async function updateAppointmentDetails(
  id: number,
  data: Partial<Omit<InsertAppointment, "id" | "code" | "createdAt" | "updatedAt">>
) {
  if (isVercelBlobRuntime()) {
    return withAppointmentsLock(async () => {
      const rows = await readBlobAppointments();
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) throw new Error("Turno no encontrado");
      rows[index] = normalizeAppointmentRow({ ...rows[index], ...data, updatedAt: new Date().toISOString() });
      await writeBlobAppointments(rows);
      return rows[index];
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.update(appointments).set(data).where(eq(appointments.id, id));
  return await getAppointmentById(id);
}

export async function deleteAppointment(id: number) {
  if (isVercelBlobRuntime()) {
    return withAppointmentsLock(async () => {
      const rows = await readBlobAppointments();
      await writeBlobAppointments(rows.filter((row) => row.id !== id));
      return { success: true };
    });
  }

  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.delete(appointments).where(eq(appointments.id, id));
  return { success: true };
}

export async function getDashboardStats() {
  const rows = await listAppointments();
  let pendientes = 0;
  let enProceso = 0;
  let finalizados = 0;
  let pagados = 0;
  let faltaPagar = 0;
  let ingresosCobrados = 0;
  let montoPendienteCobro = 0;
  let vehiculosPorLavar = 0;
  let serviciosActivos = 0;

  for (const row of rows) {
    if (row.status === "pendiente" || row.status === "confirmado") pendientes++;
    if (row.status === "en_camino" || row.status === "en_proceso") enProceso++;
    if (row.status === "confirmado") {
      montoPendienteCobro += Number(row.servicePrice) || 0;
    }
    if (row.status !== "finalizado" && row.status !== "cancelado") {
      serviciosActivos++;
      const vehicles = parseAppointmentVehicles(row as StoredAppointment);
      vehiculosPorLavar += Number(row.vehicleCount) > 0 ? Number(row.vehicleCount) : vehicles.length || 1;
    }
    if (row.status === "finalizado") {
      finalizados++;
      if (row.paymentStatus === "pagado") {
        pagados++;
        ingresosCobrados += Number(row.servicePrice) || 0;
      } else if (row.paymentStatus === "falta_pagar") {
        faltaPagar++;
      }
    }
  }

  return {
    total: rows.length,
    pendientes,
    enProceso,
    finalizados,
    pagados,
    faltaPagar,
    ingresosCobrados,
    montoPendienteCobro,
    vehiculosPorLavar,
    serviciosActivos,
  };
}

/** Tablero gerencial (filtro opcional por fechas). Independiente de la agenda operativa. */
export async function getManagerialDashboard(
  range: ManagerialDateRange = {}
): Promise<ManagerialDashboardStats> {
  const rows = await listAppointments();
  return computeManagerialStats(rows as ManagerialAppointmentRowLike[], range);
}

type ManagerialAppointmentRowLike = Parameters<typeof computeManagerialStats>[0][number];

/** Busca turnos del mismo día que solapan el horario (excluye cancelados). */
export async function findOverlappingAppointments(params: {
  scheduledDate: string;
  timeSlot: string;
  excludeId?: number;
}) {
  const rows = await listAppointments({ date: params.scheduledDate });
  return rows.filter((row) => {
    if (params.excludeId && row.id === params.excludeId) return false;
    if (row.status === "cancelado") return false;
    return timeSlotsOverlap(String(row.timeSlot || ""), params.timeSlot);
  });
}
