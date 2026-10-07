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
  /** Garaje JSON: [{id,type,model,plate}] */
  vehiclesJson: text("vehiclesJson"),
  /** Créditos de lavado gratis acumulados (fidelización). */
  freeWashCredits: int("freeWashCredits").notNull().default(0),
  lastWashAt: varchar("lastWashAt", { length: 10 }),
  lastReminderAt: timestamp("lastReminderAt"),
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

  /** 1 = turno con lavado gratis por fidelización */
  loyaltyFree: int("loyaltyFree").notNull().default(0),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

/**
 * Libro de caja: ingresos y egresos operativos.
 * Independiente del cobro de turnos (appointments.payment*).
 */
export const cashMovementTypeEnum = mysqlEnum("cashMovementType", ["ingreso", "egreso"]);

export const cashMovements = mysqlTable("cash_movements", {
  id: int("id").autoincrement().primaryKey(),
  type: cashMovementTypeEnum.notNull(),
  amount: int("amount").notNull(),
  movementDate: varchar("movementDate", { length: 10 }).notNull(),
  person: varchar("person", { length: 120 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  description: text("description"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type CashMovementRow = typeof cashMovements.$inferSelect;
export type InsertCashMovement = typeof cashMovements.$inferInsert;

/**
 * Personal del lavadero (nómina básica).
 * Independiente de agenda (appointments) y de caja general (cash_movements).
 */
export const staffPayTypeEnum = mysqlEnum("staffPayType", [
  "diario",
  "semanal",
  "quincenal",
  "mensual",
  "variable",
]);

export const staffMembers = mysqlTable("staff_members", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  role: varchar("role", { length: 80 }).notNull(),
  payType: staffPayTypeEnum.notNull().default("quincenal"),
  baseAmount: int("baseAmount"),
  active: int("active").notNull().default(1),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StaffMemberRow = typeof staffMembers.$inferSelect;
export type InsertStaffMember = typeof staffMembers.$inferInsert;

export const staffPayments = mysqlTable("staff_payments", {
  id: int("id").autoincrement().primaryKey(),
  staffId: int("staffId").notNull(),
  staffName: varchar("staffName", { length: 120 }).notNull(),
  amount: int("amount").notNull(),
  paymentDate: varchar("paymentDate", { length: 10 }).notNull(),
  concept: varchar("concept", { length: 80 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type StaffPaymentRow = typeof staffPayments.$inferSelect;
export type InsertStaffPayment = typeof staffPayments.$inferInsert;

/** Inventario de insumos (ERP). */
export const inventoryItems = mysqlTable("inventory_items", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull().default("unid"),
  stock: int("stock").notNull().default(0),
  minStock: int("minStock").notNull().default(0),
  unitCost: int("unitCost"),
  notes: text("notes"),
  active: int("active").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const stockMovementTypeEnum = mysqlEnum("stockMovementType", ["entrada", "salida", "ajuste"]);

export const stockMovements = mysqlTable("stock_movements", {
  id: int("id").autoincrement().primaryKey(),
  itemId: int("itemId").notNull(),
  itemName: varchar("itemName", { length: 120 }).notNull(),
  type: stockMovementTypeEnum.notNull(),
  quantity: int("quantity").notNull(),
  movementDate: varchar("movementDate", { length: 10 }).notNull(),
  notes: text("notes"),
  stockAfter: int("stockAfter").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/** Proveedores (ERP). */
export const suppliers = mysqlTable("suppliers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  phone: varchar("phone", { length: 40 }).notNull().default(""),
  category: varchar("category", { length: 80 }).notNull().default("Otros"),
  notes: text("notes"),
  active: int("active").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Cuentas por cobrar / deudores (ERP). */
export const receivableStatusEnum = mysqlEnum("receivableStatus", [
  "pendiente",
  "parcial",
  "cobrado",
  "anulado",
]);

export const receivables = mysqlTable("receivables", {
  id: int("id").autoincrement().primaryKey(),
  clientName: varchar("clientName", { length: 120 }).notNull(),
  clientPhone: varchar("clientPhone", { length: 40 }).notNull().default(""),
  concept: varchar("concept", { length: 160 }).notNull(),
  amount: int("amount").notNull(),
  amountPaid: int("amountPaid").notNull().default(0),
  dueDate: varchar("dueDate", { length: 10 }).notNull(),
  status: receivableStatusEnum.notNull().default("pendiente"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Armado de lavado: insumos por tipo de vehículo (auto / camioneta). */
export const washVehicleTypeEnum = mysqlEnum("washVehicleType", ["auto", "camioneta"]);

export const washRecipeLines = mysqlTable("wash_recipe_lines", {
  id: int("id").autoincrement().primaryKey(),
  vehicleType: washVehicleTypeEnum.notNull(),
  itemId: int("itemId").notNull(),
  quantityPerVehicle: int("quantityPerVehicle").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Idempotencia: un turno finalizado solo descuenta stock una vez. */
export const washStockConsumptions = mysqlTable("wash_stock_consumptions", {
  appointmentId: int("appointmentId").primaryKey(),
  notes: text("notes"),
  consumedAt: timestamp("consumedAt").defaultNow().notNull(),
});

/** Ficha fiscal de la EAS. Una sola empresa. */
export const easRegimeEnum = mysqlEnum("easRegime", ["resimple", "simple", "general"]);

export const easProfiles = mysqlTable("eas_profiles", {
  id: int("id").autoincrement().primaryKey(),
  legalName: varchar("legalName", { length: 180 }).notNull(),
  ruc: varchar("ruc", { length: 40 }).notNull(),
  regime: easRegimeEnum.notNull().default("simple"),
  activity: varchar("activity", { length: 180 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/** Libro de compras: comprobante del proveedor, base imponible sin IVA. */
export const easPurchases = mysqlTable("eas_purchases", {
  id: int("id").autoincrement().primaryKey(),
  purchaseDate: varchar("purchaseDate", { length: 10 }).notNull(),
  supplierName: varchar("supplierName", { length: 160 }).notNull(),
  supplierRuc: varchar("supplierRuc", { length: 40 }),
  voucherNumber: varchar("voucherNumber", { length: 40 }).notNull(),
  description: text("description"),
  taxed10: int("taxed10").notNull().default(0),
  iva10: int("iva10").notNull().default(0),
  taxed5: int("taxed5").notNull().default(0),
  iva5: int("iva5").notNull().default(0),
  exempt: int("exempt").notNull().default(0),
  total: int("total").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * Comprobantes de servicio (facturación operativa).
 * Un turno finalizado tiene como máximo un comprobante vigente.
 */
export const serviceInvoiceStatusEnum = mysqlEnum("serviceInvoiceStatus", ["emitida", "anulada"]);

export const serviceInvoices = mysqlTable("service_invoices", {
  id: int("id").autoincrement().primaryKey(),
  number: varchar("number", { length: 24 }).notNull().unique(),
  status: serviceInvoiceStatusEnum.notNull().default("emitida"),
  issuedDate: varchar("issuedDate", { length: 10 }).notNull(),
  appointmentId: int("appointmentId").notNull(),
  appointmentCode: varchar("appointmentCode", { length: 32 }).notNull(),
  clientName: varchar("clientName", { length: 160 }).notNull(),
  clientPhone: varchar("clientPhone", { length: 40 }).notNull().default(""),
  clientTaxId: varchar("clientTaxId", { length: 40 }),
  companyName: varchar("companyName", { length: 160 }),
  linesJson: text("linesJson").notNull(),
  total: int("total").notNull(),
  taxableBase: int("taxableBase").notNull(),
  ivaAmount: int("ivaAmount").notNull(),
  voidReason: text("voidReason"),
  voidedAt: varchar("voidedAt", { length: 40 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

