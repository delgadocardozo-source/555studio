/** Hojas de Excel para cruzar agenda, caja, facturas, deudas y clientes. */

import { agendaCashTag } from "./agendaCash";
import type { CashMovement } from "./cashLedger";
import type { CustomerCrmCard } from "./customerCrm";
import type { InventoryItem, StockMovement } from "./inventory";
import type { ServiceInvoice } from "./invoicing";
import type { StaffMember, StaffPayment } from "./payroll";
import type { AppointmentDebt } from "./receivables";
import { remainingOf } from "./receivables";
import type { FirstContactCandidate, ReengageCandidate } from "./reengage";
import type { Supplier } from "./suppliers";
import type { XlsxSheet } from "./xlsxWorkbook";

export interface ReportAppointment {
  code: string;
  scheduledDate: string;
  timeSlot: string;
  clientName: string;
  clientPhone: string;
  clientType: string;
  companyName: string;
  clientTaxId: string;
  cityZone: string;
  address: string;
  vehiclesLabel: string;
  servicePrice: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  source: string;
}

export interface ReportCashClose {
  date: string;
  efectivoIn: number;
  comprobanteIn: number;
  egresos: number;
  expectedDrawer: number;
  counted: number | null;
  difference: number | null;
  note: string;
}

export interface OperationalReportInput {
  generatedOn: string;
  appointments: ReportAppointment[];
  cash: CashMovement[];
  closes: ReportCashClose[];
  invoices: ServiceInvoice[];
  debts: AppointmentDebt[];
  customers: CustomerCrmCard[];
  stock: InventoryItem[];
  stockMoves: StockMovement[];
  staff: StaffMember[];
  payments: StaffPayment[];
  suppliers: Supplier[];
  reengage: ReengageCandidate[];
  firstContacts: FirstContactCandidate[];
}

export interface OperationalWorkbook {
  fileName: string;
  sheets: XlsxSheet[];
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function money(value: unknown): number {
  return Math.round(Number(value) || 0);
}

function yesNo(value: boolean): string {
  return value ? "Sí" : "No";
}

function cashForCode(rows: CashMovement[], code: string): number {
  const tag = agendaCashTag(code);
  return rows
    .filter((row) => row.type === "ingreso" && text(row.description).includes(tag))
    .reduce((sum, row) => sum + money(row.amount), 0);
}

function invoiceForCode(rows: ServiceInvoice[], code: string): ServiceInvoice | null {
  const matches = rows.filter((row) => row.appointmentCode === code);
  return matches.find((row) => row.status === "emitida") || matches[0] || null;
}

function debtForCode(rows: AppointmentDebt[], code: string): AppointmentDebt | null {
  return rows.find((row) => row.code === code) || null;
}

export function buildOperationalWorkbook(input: OperationalReportInput): OperationalWorkbook {
  const turnos = [...input.appointments].sort((a, b) =>
    `${b.scheduledDate}${b.timeSlot}`.localeCompare(`${a.scheduledDate}${a.timeSlot}`)
  );
  const turnosRows: XlsxSheet["rows"] = [
    ["Codigo", "Fecha", "Horario", "Cliente", "Telefono", "Tipo", "Empresa", "RUC", "Zona", "Direccion", "Vehiculos", "Monto", "Estado", "Pago", "Metodo", "Origen"],
    ...turnos.map((row) => [
      row.code,
      row.scheduledDate,
      row.timeSlot,
      row.clientName,
      row.clientPhone,
      row.clientType,
      row.companyName,
      row.clientTaxId,
      row.cityZone,
      row.address,
      row.vehiclesLabel,
      money(row.servicePrice),
      row.status,
      row.paymentStatus,
      row.paymentMethod,
      row.source,
    ]),
  ];

  const cruceRows: XlsxSheet["rows"] = [
    ["Codigo", "Fecha", "Cliente", "Telefono", "Zona", "Estado", "Pago", "Metodo", "Monto turno", "Factura", "Estado factura", "Total factura", "Caja", "Saldo deuda"],
    ...turnos.map((row) => {
      const invoice = invoiceForCode(input.invoices, row.code);
      const debt = debtForCode(input.debts, row.code);
      return [
        row.code,
        row.scheduledDate,
        row.clientName,
        row.clientPhone,
        row.cityZone,
        row.status,
        row.paymentStatus,
        row.paymentMethod,
        money(row.servicePrice),
        invoice?.number || "",
        invoice?.status || "",
        invoice ? money(invoice.total) : "",
        cashForCode(input.cash, row.code),
        debt ? remainingOf(debt) : 0,
      ];
    }),
  ];

  const cajaRows: XlsxSheet["rows"] = [
    ["Fecha", "Tipo", "Categoria", "Persona", "Monto", "Detalle"],
    ...[...input.cash]
      .sort((a, b) => b.movementDate.localeCompare(a.movementDate))
      .map((row) => [row.movementDate, row.type, row.category, row.person, money(row.amount), row.description]),
  ];

  const cierresRows: XlsxSheet["rows"] = [
    ["Fecha", "Efectivo entra", "Comprobante entra", "Egresos", "Esperado cajon", "Contado", "Diferencia", "Nota"],
    ...input.closes.map((row) => [
      row.date,
      money(row.efectivoIn),
      money(row.comprobanteIn),
      money(row.egresos),
      money(row.expectedDrawer),
      row.counted == null ? "" : money(row.counted),
      row.difference == null ? "" : money(row.difference),
      row.note,
    ]),
  ];

  const facturasRows: XlsxSheet["rows"] = [
    ["Numero", "Fecha", "Estado", "Codigo", "Cliente", "Telefono", "RUC", "Empresa", "Base", "IVA", "Total", "Motivo anulacion"],
    ...[...input.invoices]
      .sort((a, b) => b.issuedDate.localeCompare(a.issuedDate) || b.number.localeCompare(a.number))
      .map((row) => [
        row.number,
        row.issuedDate,
        row.status,
        row.appointmentCode,
        row.clientName,
        row.clientPhone,
        row.clientTaxId,
        row.companyName,
        money(row.taxableBase),
        money(row.ivaAmount),
        money(row.total),
        row.voidReason,
      ]),
  ];

  const deudasRows: XlsxSheet["rows"] = [
    ["Codigo", "Fecha", "Cliente", "Telefono", "Vehiculos", "Estado turno", "Pago", "Monto", "Cobrado", "Saldo"],
    ...input.debts.map((row) => [
      row.code,
      row.scheduledDate,
      row.clientName,
      row.clientPhone,
      row.vehicleSummary,
      row.serviceStatus,
      row.paymentStatus,
      money(row.amount),
      money(row.amountPaid),
      remainingOf(row),
    ]),
  ];

  const clientesRows: XlsxSheet["rows"] = [
    ["Cliente", "Telefono", "Tipo", "Empresa", "RUC", "Zona", "Direccion", "Lavados", "Cobrado historico", "Deuda abierta", "Creditos gratis", "Ultimo lavado", "Ultimo contacto", "Vehiculos"],
    ...[...input.customers]
      .sort((a, b) => a.clientName.localeCompare(b.clientName, "es"))
      .map((row) => [
        row.clientName,
        row.clientPhone,
        row.clientType,
        row.companyName,
        row.clientTaxId,
        row.cityZone,
        row.address,
        row.washesTotal,
        money(row.lifetimePaidGs),
        money(row.openDebtGs),
        row.freeWashCredits,
        row.lastWashAt || "",
        row.lastReminderAt || "",
        row.vehicles.map((vehicle) => [vehicle.type, vehicle.model, vehicle.plate].filter(Boolean).join(" ")).join(" · "),
      ]),
  ];

  const stockRows: XlsxSheet["rows"] = [
    ["Insumo", "Categoria", "Unidad", "Stock", "Minimo", "Costo unitario", "Valor", "Activo"],
    ...[...input.stock]
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((row) => [
        row.name,
        row.category,
        row.unit,
        row.stock,
        row.minStock,
        row.unitCost == null ? "" : money(row.unitCost),
        money((row.unitCost || 0) * Math.max(0, row.stock)),
        yesNo(row.active),
      ]),
  ];

  const stockMoveRows: XlsxSheet["rows"] = [
    ["Fecha", "Insumo", "Tipo", "Cantidad", "Stock despues", "Nota"],
    ...input.stockMoves.map((row) => [
      row.movementDate,
      row.itemName,
      row.type,
      row.quantity,
      row.stockAfter,
      row.notes,
    ]),
  ];

  const personalRows: XlsxSheet["rows"] = [
    ["Persona", "Rol", "Tipo de pago", "Monto base", "Activo", "Notas"],
    ...input.staff.map((row) => [
      row.name,
      row.role,
      row.payType,
      row.baseAmount == null ? "" : money(row.baseAmount),
      yesNo(row.active),
      row.notes,
    ]),
  ];

  const pagosRows: XlsxSheet["rows"] = [
    ["Fecha", "Persona", "Concepto", "Monto", "Nota"],
    ...[...input.payments]
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      .map((row) => [row.paymentDate, row.staffName, row.concept, money(row.amount), row.notes]),
  ];

  const proveedoresRows: XlsxSheet["rows"] = [
    ["Proveedor", "Telefono", "Categoria", "Activo", "Notas"],
    ...input.suppliers.map((row) => [row.name, row.phone, row.category, yesNo(row.active), row.notes]),
  ];

  const recontactoRows: XlsxSheet["rows"] = [
    ["Cliente", "Telefono", "Ultimo lavado", "Dias", "Contactado"],
    ...input.reengage.map((row) => [
      row.clientName,
      row.clientPhone,
      row.lastWashDate,
      row.daysSinceWash,
      row.lastReminderAt || "",
    ]),
  ];

  const primerRows: XlsxSheet["rows"] = [
    ["Cliente", "Telefono", "Contactado"],
    ...input.firstContacts.map((row) => [row.clientName, row.clientPhone, row.lastReminderAt || ""]),
  ];

  const detail: XlsxSheet[] = [
    { name: "Cruce", rows: cruceRows },
    { name: "Turnos", rows: turnosRows },
    { name: "Caja", rows: cajaRows },
    { name: "Cierres", rows: cierresRows },
    { name: "Facturas", rows: facturasRows },
    { name: "Deudas", rows: deudasRows },
    { name: "Clientes", rows: clientesRows },
    { name: "Stock", rows: stockRows },
    { name: "Stock mov", rows: stockMoveRows },
    { name: "Personal", rows: personalRows },
    { name: "Pagos personal", rows: pagosRows },
    { name: "Proveedores", rows: proveedoresRows },
    { name: "Recontacto", rows: recontactoRows },
    { name: "Primer contacto", rows: primerRows },
  ];

  const indice: XlsxSheet = {
    name: "Indice",
    rows: [
      ["Generado", input.generatedOn],
      ["Como cruzar", "Codigo une Cruce, Turnos, Facturas y Deudas. En Caja el detalle trae [AGENDA:codigo]. Telefono une Clientes, Recontacto y Primer contacto."],
      [],
      ["Hoja", "Filas"],
      ...detail.map((sheet) => [sheet.name, Math.max(0, sheet.rows.length - 1)]),
    ],
  };

  return {
    fileName: `555-informes-${input.generatedOn}.xlsx`,
    sheets: [indice, ...detail],
  };
}

export function vehiclesLabelFrom(row: {
  vehicles?: unknown;
  vehicleType?: string | null;
  vehicleModel?: string | null;
  licensePlate?: string | null;
}): string {
  if (row.vehicles) {
    try {
      const parsed = typeof row.vehicles === "string" ? JSON.parse(row.vehicles) : row.vehicles;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((vehicle) =>
            [vehicle?.type, vehicle?.model, vehicle?.plate].filter(Boolean).join(" ")
          )
          .join(" · ");
      }
    } catch {
      /* texto simple */
    }
  }
  return [row.vehicleType, row.vehicleModel, row.licensePlate].filter(Boolean).join(" ");
}
