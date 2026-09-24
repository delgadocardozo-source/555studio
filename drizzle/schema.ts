import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Categorías de vehículos admitidos por 555 Detail Studio
 */
export const vehicleTypeEnum = mysqlEnum("vehicleType", [
  "auto",
  "camioneta",
]);

/**
 * Tipo de cliente / segmento operativo
 */
export const clientTypeEnum = mysqlEnum("clientType", [
  "particular",
  "oficina",
  "empresa_flota",
]);

/**
 * Ciudades habilitadas para el servicio a domicilio
 */
export const cityZoneEnum = mysqlEnum("cityZone", [
  "Asuncion",
  "Luque",
  "Mariano Roque Alonso",
  "San Lorenzo",
]);

/**
 * Estado operativo del turno en producción
 */
export const appointmentStatusEnum = mysqlEnum("appointmentStatus", [
  "pendiente",
  "confirmado",
  "en_camino",
  "en_proceso",
  "finalizado",
  "cancelado",
]);

/**
 * Estado del cobro al finalizar un servicio
 */
export const paymentStatusEnum = mysqlEnum("paymentStatus", [
  "sin_definir",
  "pagado",
  "falta_pagar",
]);

/**
 * Medio que acredita el cobro
 */
export const paymentMethodEnum = mysqlEnum("paymentMethod", [
  "efectivo",
  "comprobante_digital",
]);

/**
 * Ficha reutilizable del cliente para agilizar reservas y facturación.
 * phoneKey normaliza el WhatsApp y funciona como identificador operativo único.
 */
export const customers = mysqlTable("customers", {
  id: int("id").autoincrement().primaryKey(),
  phoneKey: varchar("phoneKey", { length: 40 }).notNull().unique(),
  clientName: varchar("clientName", { length: 160 }).notNull(),
  clientPhone: varchar("clientPhone", { length: 40 }).notNull(),
  clientType: clientTypeEnum.default("particular").notNull(),
  companyName: varchar("companyName", { length: 160 }),
  clientTaxId: varchar("clientTaxId", { length: 40 }), // RUC, siempre opcional
  lastUsedAt: timestamp("lastUsedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

/**
 * Turnos y órdenes de trabajo de lavado a domicilio
 */
export const appointments = mysqlTable("appointments", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  
  // Datos del cliente
  clientName: varchar("clientName", { length: 160 }).notNull(),
  clientPhone: varchar("clientPhone", { length: 40 }).notNull(),
  clientType: clientTypeEnum.default("particular").notNull(),
  companyName: varchar("companyName", { length: 160 }),
  clientTaxId: varchar("clientTaxId", { length: 40 }), // RUC usado en esta orden, opcional
  
  // Vehículo principal, usado para compatibilidad con órdenes existentes
  vehicleType: vehicleTypeEnum.notNull(),
  vehicleModel: varchar("vehicleModel", { length: 120 }).notNull(),
  licensePlate: varchar("licensePlate", { length: 32 }),
  // Lista JSON de vehículos incluidos en la misma visita y total consolidado
  vehicleCount: int("vehicleCount").default(1).notNull(),
  vehicles: text("vehicles"),
  servicePrice: int("servicePrice").notNull(), // total consolidado del servicio
  
  // Ubicación a domicilio
  cityZone: cityZoneEnum.notNull(),
  address: text("address").notNull(),
  locationUrl: varchar("locationUrl", { length: 1024 }), // Google Maps, Waze u otra URL compartida por el cliente
  addressReference: text("addressReference"),
  
  // Fecha y franja horaria
  scheduledDate: varchar("scheduledDate", { length: 10 }).notNull(), // Formato YYYY-MM-DD
  timeSlot: varchar("timeSlot", { length: 20 }).notNull(), // ej: "08:00 - 09:30"
  
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
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;
