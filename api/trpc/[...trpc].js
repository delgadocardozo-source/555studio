// server/vercel-api.ts
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";
var decodeOAuthState = (state) => {
  let decoded;
  try {
    decoded = atob(state);
  } catch {
    return { redirectUri: "" };
  }
  try {
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed.redirectUri === "string") return parsed;
  } catch {
  }
  return { redirectUri: decoded };
};

// shared/scheduling.ts
var MINUTES_PER_VEHICLE = 80;
var WORKDAY_START = "08:00";
var WORKDAY_END = "18:00";
var START_TIMES = (() => {
  const starts = [];
  const dayEnd = timeToMinutes(WORKDAY_END);
  for (let m = timeToMinutes(WORKDAY_START); m + MINUTES_PER_VEHICLE <= dayEnd; m += 20) {
    starts.push(minutesToTime(m));
  }
  return starts;
})();
var SLOT_BANDS = (() => {
  const bands = [];
  const dayEnd = timeToMinutes(WORKDAY_END);
  for (let m = timeToMinutes(WORKDAY_START); m + MINUTES_PER_VEHICLE <= dayEnd; m += MINUTES_PER_VEHICLE) {
    bands.push(`${minutesToTime(m)} - ${minutesToTime(m + MINUTES_PER_VEHICLE)}`);
  }
  return bands;
})();
function timeToMinutes(time) {
  const [h, m] = time.trim().split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minutesToTime(total) {
  const clamped = Math.max(0, Math.min(total, 24 * 60 - 1));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function formatDuration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}
function durationForVehicles(vehicleCount) {
  const count = Math.max(1, Math.floor(vehicleCount) || 1);
  return count * MINUTES_PER_VEHICLE;
}
function buildTimeSlot(startTime, vehicleCount) {
  const start = timeToMinutes(startTime);
  const end = start + durationForVehicles(vehicleCount);
  return `${minutesToTime(start)} - ${minutesToTime(end)}`;
}
function parseTimeSlot(timeSlot) {
  if (!timeSlot || typeof timeSlot !== "string") return null;
  const parts = timeSlot.split("-").map((p) => p.trim());
  if (parts.length < 2) return null;
  const start = timeToMinutes(parts[0]);
  const end = timeToMinutes(parts[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}
function getSlotStart(timeSlot) {
  const parsed = parseTimeSlot(timeSlot);
  if (!parsed) return timeSlot?.split("-")[0]?.trim() || WORKDAY_START;
  return minutesToTime(parsed.start);
}
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
function timeSlotsOverlap(a, b) {
  const pa = parseTimeSlot(a);
  const pb = parseTimeSlot(b);
  if (!pa || !pb) return a === b;
  return rangesOverlap(pa.start, pa.end, pb.start, pb.end);
}
function fitsInWorkday(startTime, vehicleCount) {
  const start = timeToMinutes(startTime);
  const end = start + durationForVehicles(vehicleCount);
  return start >= timeToMinutes(WORKDAY_START) && end <= timeToMinutes(WORKDAY_END);
}

// server/routers.ts
import { z as z2 } from "zod";
import { put as putBlob2 } from "@vercel/blob";
import { TRPCError as TRPCError3 } from "@trpc/server";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/storage.ts
function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;
  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}
function normalizeKey(relKey) {
  return relKey.replace(/^\/+/, "");
}
function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}
async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` }
  });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url: s3Url } = await presignResp.json();
  if (!s3Url) throw new Error("Forge returned empty presign URL");
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }
  return { key, url: `/manus-storage/${key}` };
}

// server/db.ts
import { and, desc, eq, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { get as getBlob, put as putBlob } from "@vercel/blob";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var vehicleTypeEnum = mysqlEnum("vehicleType", [
  "auto",
  "camioneta"
]);
var clientTypeEnum = mysqlEnum("clientType", [
  "particular",
  "oficina",
  "empresa_flota"
]);
var cityZoneEnum = mysqlEnum("cityZone", [
  "Asuncion",
  "Luque",
  "Mariano Roque Alonso",
  "San Lorenzo"
]);
var appointmentStatusEnum = mysqlEnum("appointmentStatus", [
  "pendiente",
  "confirmado",
  "en_camino",
  "en_proceso",
  "finalizado",
  "cancelado"
]);
var paymentStatusEnum = mysqlEnum("paymentStatus", [
  "sin_definir",
  "pagado",
  "falta_pagar"
]);
var paymentMethodEnum = mysqlEnum("paymentMethod", [
  "efectivo",
  "comprobante_digital"
]);
var customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  phoneKey: varchar("phoneKey", { length: 40 }).notNull().unique(),
  clientName: varchar("clientName", { length: 160 }).notNull(),
  clientPhone: varchar("clientPhone", { length: 40 }).notNull(),
  clientType: clientTypeEnum.default("particular").notNull(),
  companyName: varchar("companyName", { length: 160 }),
  clientTaxId: varchar("clientTaxId", { length: 40 }),
  // RUC, siempre opcional
  lastUsedAt: timestamp("lastUsedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  // Datos del cliente
  clientName: varchar("clientName", { length: 160 }).notNull(),
  clientPhone: varchar("clientPhone", { length: 40 }).notNull(),
  clientType: clientTypeEnum.default("particular").notNull(),
  companyName: varchar("companyName", { length: 160 }),
  clientTaxId: varchar("clientTaxId", { length: 40 }),
  // RUC usado en esta orden, opcional
  // Vehículo principal, usado para compatibilidad con órdenes existentes
  vehicleType: vehicleTypeEnum.notNull(),
  vehicleModel: varchar("vehicleModel", { length: 120 }).notNull(),
  licensePlate: varchar("licensePlate", { length: 32 }),
  // Lista JSON de vehículos incluidos en la misma visita y total consolidado
  vehicleCount: int("vehicleCount").default(1).notNull(),
  vehicles: text("vehicles"),
  servicePrice: int("servicePrice").notNull(),
  // total consolidado del servicio
  // Ubicación a domicilio
  cityZone: cityZoneEnum.notNull(),
  address: text("address").notNull(),
  locationUrl: varchar("locationUrl", { length: 1024 }),
  // Google Maps, Waze u otra URL compartida por el cliente
  addressReference: text("addressReference"),
  // Fecha y franja horaria
  scheduledDate: varchar("scheduledDate", { length: 10 }).notNull(),
  // Formato YYYY-MM-DD
  timeSlot: varchar("timeSlot", { length: 20 }).notNull(),
  // ej: "08:00 - 09:30"
  // Operación y estado
  status: appointmentStatusEnum.default("pendiente").notNull(),
  notes: text("notes"),
  // Cierre y cobranza: finalizar exige elegir pagado o falta pagar
  paymentStatus: paymentStatusEnum.default("sin_definir").notNull(),
  paymentMethod: paymentMethodEnum,
  paymentReceiptUrl: varchar("paymentReceiptUrl", { length: 1024 }),
  paymentReceiptName: varchar("paymentReceiptName", { length: 255 }),
  paymentDeclaredAt: timestamp("paymentDeclaredAt"),
  // Origen del alta (interno o futuro portal cliente)
  source: mysqlEnum("source", ["interno_manual", "portal_cliente"]).default("interno_manual").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});

// server/db.ts
function parseAppointmentVehicles(row) {
  if (row.vehicles) {
    try {
      const parsed = typeof row.vehicles === "string" ? JSON.parse(row.vehicles) : row.vehicles;
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
    }
  }
  return [
    {
      type: row.vehicleType,
      model: row.vehicleModel,
      plate: row.licensePlate || null,
      price: row.servicePrice
    }
  ];
}
var _db = null;
var BLOB_APPOINTMENTS_PATH = "555-detail-agenda/data/appointments.json";
var BLOB_CUSTOMERS_PATH = "555-detail-agenda/data/customers.json";
function isVercelBlobRuntime() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}
async function readBlobAppointments() {
  const result = await getBlob(BLOB_APPOINTMENTS_PATH, { access: "private", useCache: false });
  if (!result || !result.stream) return [];
  try {
    const text2 = await new Response(result.stream).text();
    return JSON.parse(text2);
  } catch {
    return [];
  }
}
async function putJsonBlob(pathname, rows) {
  await putBlob(pathname, JSON.stringify(rows), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    // Minimiza cache CDN (mínimo soportado) para que list/create vean datos frescos.
    cacheControlMaxAge: 60
  });
}
async function writeBlobAppointments(rows) {
  await putJsonBlob(BLOB_APPOINTMENTS_PATH, rows);
}
var appointmentsWriteChain = Promise.resolve();
function withAppointmentsLock(fn) {
  const run = appointmentsWriteChain.then(fn, fn);
  appointmentsWriteChain = run.then(
    () => void 0,
    () => void 0
  );
  return run;
}
function normalizePhoneKey(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const withoutZero = digits.replace(/^0/, "");
  return withoutZero.startsWith("595") ? withoutZero : `595${withoutZero}`;
}
async function readBlobCustomers() {
  const result = await getBlob(BLOB_CUSTOMERS_PATH, { access: "private", useCache: false });
  if (!result || !result.stream) return [];
  try {
    const text2 = await new Response(result.stream).text();
    return JSON.parse(text2);
  } catch {
    return [];
  }
}
async function writeBlobCustomers(rows) {
  await putJsonBlob(BLOB_CUSTOMERS_PATH, rows);
}
async function upsertCustomerProfile(params) {
  const phoneKey = normalizePhoneKey(params.clientPhone);
  if (!phoneKey) return null;
  const payload = {
    phoneKey,
    clientName: params.clientName.trim(),
    clientPhone: params.clientPhone.trim(),
    clientType: params.clientType,
    companyName: params.companyName?.trim() || null,
    clientTaxId: params.clientTaxId?.trim() || null,
    lastUsedAt: /* @__PURE__ */ new Date()
  };
  if (isVercelBlobRuntime()) {
    const rows = await readBlobCustomers();
    const index = rows.findIndex((row) => row.phoneKey === phoneKey);
    const nowIso = (/* @__PURE__ */ new Date()).toISOString();
    if (index >= 0) {
      rows[index] = {
        ...rows[index],
        ...payload,
        clientTaxId: payload.clientTaxId || rows[index].clientTaxId || null,
        companyName: payload.companyName || rows[index].companyName || null,
        updatedAt: nowIso,
        lastUsedAt: nowIso
      };
      await writeBlobCustomers(rows);
      return rows[index];
    }
    const created = {
      ...payload,
      id: rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastUsedAt: nowIso
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
      lastUsedAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }
  });
  const matched = await db.select().from(customers).where(eq(customers.phoneKey, phoneKey)).limit(1);
  return matched[0] ?? null;
}
async function searchCustomers(query = "") {
  const clean = query.trim().toLowerCase();
  if (isVercelBlobRuntime()) {
    const rows = await readBlobCustomers();
    if (!clean) {
      return rows.sort((a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || ""))).slice(0, 20);
    }
    return rows.filter((row) => {
      const full = [row.clientName, row.clientPhone, row.companyName, row.clientTaxId, row.phoneKey].filter(Boolean).join(" ").toLowerCase();
      return full.includes(clean);
    }).sort((a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || ""))).slice(0, 20);
  }
  const db = await getDb();
  if (!db) return [];
  if (!clean) {
    return await db.select().from(customers).orderBy(desc(customers.lastUsedAt)).limit(20);
  }
  const q = `%${clean}%`;
  return await db.select().from(customers).where(
    or(
      sql`${customers.clientName} LIKE ${q}`,
      sql`${customers.clientPhone} LIKE ${q}`,
      sql`${customers.companyName} LIKE ${q}`,
      sql`${customers.clientTaxId} LIKE ${q}`,
      sql`${customers.phoneKey} LIKE ${q}`
    )
  ).orderBy(desc(customers.lastUsedAt)).limit(20);
}
async function findCustomerByPhone(phone) {
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
function matchFilters(row, filters) {
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
      row.companyName
    ].filter(Boolean).join(" ").toLowerCase();
    if (!searchable.includes(search)) return false;
  }
  return true;
}
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId || isVercelBlobRuntime()) return;
  const db = await getDb();
  if (!db) return;
  try {
    const values = { openId: user.openId };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) values.lastSignedIn = /* @__PURE__ */ new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  if (isVercelBlobRuntime()) return void 0;
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function listAppointments(filters = {}) {
  if (isVercelBlobRuntime()) {
    const rows = await readBlobAppointments();
    return rows.filter((row) => matchFilters(row, filters)).sort((a, b) => `${b.scheduledDate} ${b.timeSlot}`.localeCompare(`${a.scheduledDate} ${a.timeSlot}`));
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
  return conditions.length > 0 ? await query.where(and(...conditions)) : await query;
}
async function getAppointmentById(id) {
  if (isVercelBlobRuntime()) {
    const rows2 = await readBlobAppointments();
    return rows2.find((row) => row.id === id);
  }
  const db = await getDb();
  if (!db) return void 0;
  const rows = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
  return rows[0];
}
async function createAppointment(data) {
  const randomSuffix = Math.floor(1e3 + Math.random() * 9e3);
  const cleanDate = data.scheduledDate.replace(/-/g, "");
  const code = `555-${cleanDate}-${randomSuffix}`;
  if (isVercelBlobRuntime()) {
    return withAppointmentsLock(async () => {
      const rows = await readBlobAppointments();
      const created2 = {
        ...data,
        id: rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1,
        code,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      rows.push(created2);
      await writeBlobAppointments(rows);
      return created2;
    });
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.insert(appointments).values({ ...data, code });
  const created = await db.select().from(appointments).where(eq(appointments.code, code)).limit(1);
  return created[0];
}
async function updateAppointmentStatus(id, status) {
  if (isVercelBlobRuntime()) {
    return withAppointmentsLock(async () => {
      const rows = await readBlobAppointments();
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) throw new Error("Turno no encontrado");
      rows[index] = { ...rows[index], status, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeBlobAppointments(rows);
      return rows[index];
    });
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.update(appointments).set({ status }).where(eq(appointments.id, id));
  return await getAppointmentById(id);
}
async function finalizeAppointmentWithPayment(params) {
  if (params.paymentStatus === "pagado") {
    if (!params.paymentMethod) throw new Error("Debe seleccionar si el pago fue en efectivo o con comprobante digital");
    if (params.paymentMethod === "comprobante_digital" && !params.paymentReceiptUrl) {
      throw new Error("Es obligatorio adjuntar el comprobante de pago digital");
    }
  }
  const payload = {
    status: "finalizado",
    paymentStatus: params.paymentStatus,
    paymentMethod: params.paymentStatus === "pagado" ? params.paymentMethod ?? null : null,
    paymentReceiptUrl: params.paymentStatus === "pagado" ? params.paymentReceiptUrl ?? null : null,
    paymentReceiptName: params.paymentStatus === "pagado" ? params.paymentReceiptName ?? null : null,
    paymentDeclaredAt: /* @__PURE__ */ new Date()
  };
  if (isVercelBlobRuntime()) {
    return withAppointmentsLock(async () => {
      const rows = await readBlobAppointments();
      const index = rows.findIndex((row) => row.id === params.id);
      if (index < 0) throw new Error("Turno no encontrado");
      rows[index] = { ...rows[index], ...payload, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeBlobAppointments(rows);
      return rows[index];
    });
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.update(appointments).set(payload).where(eq(appointments.id, params.id));
  return await getAppointmentById(params.id);
}
async function updateAppointmentDetails(id, data) {
  if (isVercelBlobRuntime()) {
    return withAppointmentsLock(async () => {
      const rows = await readBlobAppointments();
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) throw new Error("Turno no encontrado");
      rows[index] = { ...rows[index], ...data, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writeBlobAppointments(rows);
      return rows[index];
    });
  }
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.update(appointments).set(data).where(eq(appointments.id, id));
  return await getAppointmentById(id);
}
async function deleteAppointment(id) {
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
async function getDashboardStats() {
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
      const vehicles = parseAppointmentVehicles(row);
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
    serviciosActivos
  };
}
async function findOverlappingAppointments(params) {
  const rows = await listAppointments({ date: params.scheduledDate });
  return rows.filter((row) => {
    if (params.excludeId && row.id === params.excludeId) return false;
    if (row.status === "cancelado") return false;
    return timeSlotsOverlap(String(row.timeSlot || ""), params.timeSlot);
  });
}

// server/routers.ts
async function assertScheduleAvailable(params) {
  const start = getSlotStart(params.timeSlot);
  const normalizedSlot = buildTimeSlot(start, params.vehicleCount);
  if (!fitsInWorkday(start, params.vehicleCount)) {
    throw new TRPCError3({
      code: "BAD_REQUEST",
      message: `El lavado de ${params.vehicleCount} veh\xEDculo(s) (${formatDuration(durationForVehicles(params.vehicleCount))}) no entra en la jornada 08:00\u201318:00 partiendo de ${start}.`
    });
  }
  const overlaps = await findOverlappingAppointments({
    scheduledDate: params.scheduledDate,
    timeSlot: normalizedSlot,
    excludeId: params.excludeId
  });
  if (overlaps.length > 0) {
    const conflict = overlaps[0];
    throw new TRPCError3({
      code: "CONFLICT",
      message: `Horario ocupado: se solapa con ${conflict.clientName} (${conflict.timeSlot}). Cada veh\xEDculo requiere 1h 20min.`
    });
  }
  return normalizedSlot;
}
var vehicleItemInputSchema = z2.object({
  type: z2.enum(["auto", "camioneta"]),
  model: z2.string().min(2, "Modelo o marca del veh\xEDculo requerido"),
  plate: z2.string().optional().nullable()
});
var appointmentInputSchema = z2.object({
  clientName: z2.string().min(2, "El nombre del cliente es obligatorio"),
  clientPhone: z2.string().min(6, "El tel\xE9fono de contacto es obligatorio"),
  clientType: z2.enum(["particular", "oficina", "empresa_flota"]).default("particular"),
  companyName: z2.string().optional().nullable(),
  clientTaxId: z2.string().optional().nullable(),
  // RUC opcional
  // Compatible con llamadas directas anteriores de un solo vehículo
  vehicleType: z2.enum(["auto", "camioneta"]).optional(),
  vehicleModel: z2.string().optional(),
  licensePlate: z2.string().optional().nullable(),
  // Lista de vehículos para clientes con más de un auto/camioneta
  vehicles: z2.array(vehicleItemInputSchema).min(1, "Debe cargar al menos un veh\xEDculo").optional(),
  servicePrice: z2.number().int().positive().optional(),
  cityZone: z2.enum(["Asuncion", "Luque", "Mariano Roque Alonso", "San Lorenzo"]),
  address: z2.string().min(3, "La direcci\xF3n exacta es requerida"),
  locationUrl: z2.string().optional().nullable(),
  addressReference: z2.string().optional().nullable(),
  scheduledDate: z2.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inv\xE1lido (YYYY-MM-DD)"),
  timeSlot: z2.string().min(3, "Franja horaria requerida"),
  notes: z2.string().optional().nullable(),
  source: z2.enum(["interno_manual", "portal_cliente"]).default("interno_manual")
});
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true };
    })
  }),
  appointments: router({
    list: publicProcedure.input(
      z2.object({
        date: z2.string().optional(),
        month: z2.string().optional(),
        status: z2.enum(["pendiente", "confirmado", "en_camino", "en_proceso", "finalizado", "cancelado"]).optional(),
        paymentStatus: z2.enum(["sin_definir", "pagado", "falta_pagar"]).optional(),
        cityZone: z2.enum(["Asuncion", "Luque", "Mariano Roque Alonso", "San Lorenzo"]).optional(),
        vehicleType: z2.enum(["auto", "camioneta"]).optional(),
        clientType: z2.enum(["particular", "oficina", "empresa_flota"]).optional(),
        search: z2.string().optional()
      }).optional()
    ).query(async ({ input }) => await listAppointments(input)),
    getById: publicProcedure.input(z2.object({ id: z2.number().int() })).query(async ({ input }) => await getAppointmentById(input.id)),
    create: publicProcedure.input(appointmentInputSchema).mutation(async ({ input }) => {
      const rawList = input.vehicles && input.vehicles.length > 0 ? input.vehicles : [
        {
          type: input.vehicleType || "auto",
          model: input.vehicleModel || "Veh\xEDculo sin modelo",
          plate: input.licensePlate || null
        }
      ];
      const computedVehicles = rawList.map((v) => ({
        type: v.type,
        model: v.model.trim(),
        plate: v.plate?.trim() || null,
        price: v.type === "auto" ? 9e4 : 12e4
      }));
      const totalServicePrice = computedVehicles.reduce((acc, curr) => acc + curr.price, 0);
      const primary = computedVehicles[0];
      const normalizedTimeSlot = await assertScheduleAvailable({
        scheduledDate: input.scheduledDate,
        timeSlot: input.timeSlot,
        vehicleCount: computedVehicles.length
      });
      await upsertCustomerProfile({
        clientName: input.clientName,
        clientPhone: input.clientPhone,
        clientType: input.clientType,
        companyName: input.companyName ?? null,
        clientTaxId: input.clientTaxId?.trim() ? input.clientTaxId.trim() : null
      });
      return await createAppointment({
        clientName: input.clientName,
        clientPhone: input.clientPhone,
        clientType: input.clientType,
        companyName: input.companyName ?? null,
        clientTaxId: input.clientTaxId?.trim() ? input.clientTaxId.trim() : null,
        vehicleType: primary.type,
        vehicleModel: primary.model,
        licensePlate: primary.plate,
        vehicleCount: computedVehicles.length,
        vehicles: JSON.stringify(computedVehicles),
        servicePrice: totalServicePrice,
        cityZone: input.cityZone,
        address: input.address,
        locationUrl: input.locationUrl?.trim() ? input.locationUrl.trim() : null,
        addressReference: input.addressReference ?? null,
        scheduledDate: input.scheduledDate,
        timeSlot: normalizedTimeSlot,
        notes: input.notes ?? null,
        status: "pendiente",
        paymentStatus: "sin_definir",
        source: input.source || "interno_manual"
      });
    }),
    updateStatus: publicProcedure.input(z2.object({ id: z2.number().int(), status: z2.enum(["pendiente", "confirmado", "en_camino", "en_proceso", "finalizado", "cancelado"]) })).mutation(async ({ input }) => await updateAppointmentStatus(input.id, input.status)),
    finalizeWithPayment: publicProcedure.input(
      z2.object({
        id: z2.number().int(),
        paymentStatus: z2.enum(["pagado", "falta_pagar"]),
        paymentMethod: z2.enum(["efectivo", "comprobante_digital"]).optional(),
        paymentReceiptUrl: z2.string().optional().nullable(),
        paymentReceiptName: z2.string().optional().nullable()
      })
    ).mutation(async ({ input }) => await finalizeAppointmentWithPayment(input)),
    // Comprobantes en Vercel Blob (producción) o Manus Storage (workspace actual)
    uploadReceipt: publicProcedure.input(z2.object({ fileName: z2.string(), contentType: z2.string(), base64Data: z2.string() })).mutation(async ({ input }) => {
      const buffer = Buffer.from(input.base64Data, "base64");
      const safeName = input.fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
      const key = `555-detail-agenda/receipts/${Date.now()}-${safeName}`;
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        const stored2 = await putBlob2(key, buffer, {
          access: "private",
          contentType: input.contentType || "application/octet-stream"
        });
        return { key: stored2.pathname, url: stored2.url };
      }
      const stored = await storagePut(key, buffer, input.contentType || "application/octet-stream");
      return { key: stored.key, url: stored.url };
    }),
    update: publicProcedure.input(z2.object({ id: z2.number().int(), data: appointmentInputSchema.partial() })).mutation(async ({ input }) => {
      const { vehicles, clientTaxId, ...rest } = input.data;
      const payload = { ...rest };
      if (clientTaxId !== void 0) {
        payload.clientTaxId = clientTaxId?.trim() ? clientTaxId.trim() : null;
      }
      if (vehicles) {
        const computed = vehicles.map((v) => ({
          type: v.type,
          model: v.model.trim(),
          plate: v.plate?.trim() || null,
          price: v.type === "auto" ? 9e4 : 12e4
        }));
        payload.vehicles = JSON.stringify(computed);
        payload.vehicleCount = computed.length;
        payload.servicePrice = computed.reduce((acc, curr) => acc + curr.price, 0);
        if (computed[0]) {
          payload.vehicleType = computed[0].type;
          payload.vehicleModel = computed[0].model;
          payload.licensePlate = computed[0].plate;
        }
      }
      const existing = await getAppointmentById(input.id);
      if (!existing) {
        throw new TRPCError3({ code: "NOT_FOUND", message: "Turno no encontrado" });
      }
      const nextDate = payload.scheduledDate || existing.scheduledDate;
      const nextVehicleCount = payload.vehicleCount != null ? Number(payload.vehicleCount) : Number(existing.vehicleCount) || 1;
      const nextSlotInput = payload.timeSlot || existing.timeSlot;
      payload.timeSlot = await assertScheduleAvailable({
        scheduledDate: nextDate,
        timeSlot: nextSlotInput,
        vehicleCount: nextVehicleCount,
        excludeId: input.id
      });
      if (input.data.clientPhone && input.data.clientName) {
        await upsertCustomerProfile({
          clientName: input.data.clientName,
          clientPhone: input.data.clientPhone,
          clientType: input.data.clientType || "particular",
          companyName: input.data.companyName ?? null,
          clientTaxId: input.data.clientTaxId?.trim() ? input.data.clientTaxId.trim() : null
        });
      }
      return await updateAppointmentDetails(input.id, payload);
    }),
    delete: publicProcedure.input(z2.object({ id: z2.number().int() })).mutation(async ({ input }) => await deleteAppointment(input.id)),
    stats: publicProcedure.query(async () => await getDashboardStats())
  }),
  customers: router({
    search: publicProcedure.input(z2.object({ query: z2.string().optional() })).query(async ({ input }) => await searchCustomers(input.query || "")),
    findByPhone: publicProcedure.input(z2.object({ phone: z2.string() })).query(async ({ input }) => await findCustomerByPhone(input.phone)),
    upsert: publicProcedure.input(
      z2.object({
        clientName: z2.string().min(2),
        clientPhone: z2.string().min(6),
        clientType: z2.enum(["particular", "oficina", "empresa_flota"]).default("particular"),
        companyName: z2.string().optional().nullable(),
        clientTaxId: z2.string().optional().nullable()
      })
    ).mutation(async ({ input }) => await upsertCustomerProfile(input))
  })
});

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString2 = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    return decodeOAuthState(state).redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString2(openId) || !isNonEmptyString2(appId) || !isNonEmptyString2(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }
    const session = await this.verifySession(sessionToken);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionToken ?? "");
        await upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var CRON_OPEN_ID_PREFIX = "cron_";
function buildCronUser(userInfo) {
  const now = /* @__PURE__ */ new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? void 0,
    isCron: true
  };
}
var sdk = new SDKServer();

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/vercel-api.ts
var app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext
  })
);
var vercel_api_default = app;
export {
  vercel_api_default as default
};
