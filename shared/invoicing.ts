/**
 * Facturación operativa del lavadero.
 * Comprobante de servicio con IVA 10% incluido (Paraguay).
 * No es factura electrónica SET: el número y el estado son internos y auditables.
 */

export const SERVICE_IVA_RATE = 0.1;

export type ServiceInvoiceStatus = "emitida" | "anulada";

export interface InvoiceLine {
  description: string;
  quantity: number;
  /** Precio unitario con IVA incluido, en guaraníes. */
  unitPrice: number;
  total: number;
}

export interface ServiceInvoice {
  id: number;
  /** Secuencia propia. No se reutiliza aunque se anule. */
  number: string;
  status: ServiceInvoiceStatus;
  issuedDate: string;
  appointmentId: number;
  appointmentCode: string;
  clientName: string;
  clientPhone: string;
  clientTaxId: string;
  companyName: string;
  lines: InvoiceLine[];
  /** Total con IVA incluido. */
  total: number;
  taxableBase: number;
  ivaAmount: number;
  voidReason: string;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceAppointmentSource {
  id: number;
  code?: string | null;
  status: string;
  paymentStatus?: string | null;
  clientName: string;
  clientPhone: string;
  clientTaxId?: string | null;
  companyName?: string | null;
  servicePrice?: number | null;
  scheduledDate: string;
  vehicleType?: string | null;
  vehicleModel?: string | null;
  licensePlate?: string | null;
  vehicles?: unknown;
}

export interface InvoiceDraft {
  appointmentId: number;
  appointmentCode: string;
  issuedDate: string;
  clientName: string;
  clientPhone: string;
  clientTaxId: string;
  companyName: string;
  lines: InvoiceLine[];
  total: number;
  taxableBase: number;
  ivaAmount: number;
}

/** Base + IVA = total. El IVA sale del precio ya cobrado (incluido). */
export function splitIvaIncluded(totalGs: number): {
  total: number;
  taxableBase: number;
  ivaAmount: number;
} {
  const total = Math.max(0, Math.round(Number(totalGs) || 0));
  const ivaAmount = Math.round((total * 10) / 110);
  const taxableBase = total - ivaAmount;
  return { total, taxableBase, ivaAmount };
}

export function formatInvoiceNumber(sequence: number): string {
  const n = Math.max(1, Math.floor(sequence));
  return `CS-${String(n).padStart(6, "0")}`;
}

export function parseInvoiceSequence(number: string): number {
  const match = String(number || "").match(/(\d+)\s*$/);
  if (!match) return 0;
  return Number(match[1]) || 0;
}

/** Siguiente número. Los anulados ocupan secuencia y no se reciclan. */
export function nextInvoiceNumber(existingNumbers: string[]): string {
  const max = existingNumbers.reduce((acc, n) => Math.max(acc, parseInvoiceSequence(n)), 0);
  return formatInvoiceNumber(max + 1);
}

function vehicleLabel(type: string, model: string, plate: string): string {
  const kind = type === "camioneta" ? "Camioneta" : "Auto";
  const name = model.trim();
  const tag = plate.trim();
  return [`Lavado ${kind}`, name, tag].filter(Boolean).join(" · ");
}

export function linesFromAppointment(row: InvoiceAppointmentSource): InvoiceLine[] {
  let parsed: unknown = row.vehicles;
  if (typeof parsed === "string" && parsed.trim()) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
  }
  if (Array.isArray(parsed) && parsed.length > 0) {
    const lines = parsed
      .map((raw) => {
        const v = raw as { type?: string; model?: string; plate?: string; price?: number };
        const unitPrice = Math.max(0, Math.round(Number(v.price) || 0));
        return {
          description: vehicleLabel(String(v.type || "auto"), String(v.model || ""), String(v.plate || "")),
          quantity: 1,
          unitPrice,
          total: unitPrice,
        };
      })
      .filter((line) => line.description.trim());
    if (lines.length > 0) {
      const expected = Math.max(0, Math.round(Number(row.servicePrice) || 0));
      const summed = lines.reduce((s, l) => s + l.total, 0);
      if (summed !== expected) {
        if (lines.length === 1 || summed === 0) {
          return [
            {
              description: lines.map((l) => l.description).join(" + "),
              quantity: 1,
              unitPrice: expected,
              total: expected,
            },
          ];
        }
        const next = lines.map((l) => ({ ...l }));
        const last = next[next.length - 1];
        const adjusted = last.total + (expected - summed);
        if (adjusted < 0) {
          return [
            {
              description: next.map((l) => l.description).join(" + "),
              quantity: 1,
              unitPrice: expected,
              total: expected,
            },
          ];
        }
        last.total = adjusted;
        last.unitPrice = adjusted;
        return next;
      }
      return lines;
    }
  }
  const total = Math.max(0, Math.round(Number(row.servicePrice) || 0));
  return [
    {
      description: vehicleLabel(
        String(row.vehicleType || "auto"),
        String(row.vehicleModel || ""),
        String(row.licensePlate || "")
      ),
      quantity: 1,
      unitPrice: total,
      total,
    },
  ];
}

export function activeInvoiceForAppointment(
  invoices: Array<Pick<ServiceInvoice, "appointmentId" | "status">>,
  appointmentId: number
): boolean {
  return invoices.some((inv) => inv.appointmentId === appointmentId && inv.status === "emitida");
}

export function buildInvoiceDraft(
  row: InvoiceAppointmentSource,
  existing: Array<Pick<ServiceInvoice, "appointmentId" | "status">>,
  issuedDate: string
): InvoiceDraft {
  if (row.status === "cancelado") {
    throw new Error("No se factura un turno cancelado");
  }
  if (row.status !== "finalizado") {
    throw new Error("Solo se factura un lavado finalizado");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedDate)) {
    throw new Error("Fecha de emisión inválida");
  }
  if (activeInvoiceForAppointment(existing, row.id)) {
    throw new Error("Ese turno ya tiene un comprobante vigente");
  }
  const lines = linesFromAppointment(row);
  const total = lines.reduce((s, l) => s + l.total, 0);
  if (total <= 0) {
    throw new Error("El turno no tiene monto para facturar");
  }
  const tax = splitIvaIncluded(total);
  if (tax.taxableBase + tax.ivaAmount !== tax.total) {
    throw new Error("El desglose de IVA no cierra");
  }
  return {
    appointmentId: row.id,
    appointmentCode: String(row.code || row.id),
    issuedDate,
    clientName: String(row.clientName || "").trim(),
    clientPhone: String(row.clientPhone || "").trim(),
    clientTaxId: String(row.clientTaxId || "").trim(),
    companyName: String(row.companyName || "").trim(),
    lines,
    total: tax.total,
    taxableBase: tax.taxableBase,
    ivaAmount: tax.ivaAmount,
  };
}

export function assertVoidReason(reason: string): string {
  const clean = String(reason || "").trim();
  if (clean.length < 3) throw new Error("Indicá el motivo de anulación");
  return clean;
}

export interface InvoiceListStats {
  issuedCount: number;
  voidedCount: number;
  issuedTotalGs: number;
  /** Emitidas cuyo turno sigue sin pagar. */
  pendingCollectionGs: number;
  pendingCount: number;
}

export function computeInvoiceStats(
  invoices: ServiceInvoice[],
  paymentByAppointment: Map<number, string>
): InvoiceListStats {
  let issuedCount = 0;
  let voidedCount = 0;
  let issuedTotalGs = 0;
  let pendingCollectionGs = 0;
  let pendingCount = 0;
  for (const inv of invoices) {
    if (inv.status === "anulada") {
      voidedCount += 1;
      continue;
    }
    issuedCount += 1;
    issuedTotalGs += inv.total;
    const pay = paymentByAppointment.get(inv.appointmentId) || "";
    if (pay !== "pagado") {
      pendingCollectionGs += inv.total;
      pendingCount += 1;
    }
  }
  return { issuedCount, voidedCount, issuedTotalGs, pendingCollectionGs, pendingCount };
}
