/**
 * Deudores ERP — automáticos desde agenda (paymentStatus = falta_pagar).
 * No hay alta manual: la deuda nace al finalizar un lavado como “falta pagar”.
 */
import {
  appointmentToDebt,
  computeAppointmentDebtStats,
  listCollectedDebtsFromAppointments,
  listOpenDebtsFromAppointments,
  type AppointmentDebt,
} from "../shared/receivables";
import * as agendaDb from "./db";

export async function listOpenDebts(): Promise<AppointmentDebt[]> {
  const rows = await agendaDb.listAppointments({ paymentStatus: "falta_pagar" });
  return listOpenDebtsFromAppointments(rows as any);
}

export async function listCollectedDebts(limit = 40): Promise<AppointmentDebt[]> {
  const rows = await agendaDb.listAppointments({
    status: "finalizado",
    paymentStatus: "pagado",
  });
  return listCollectedDebtsFromAppointments(rows as any, limit);
}

export async function listDebts(params?: { includeCollected?: boolean }) {
  const open = await listOpenDebts();
  if (!params?.includeCollected) return open;
  const collected = await listCollectedDebts(40);
  return [...open, ...collected];
}

export async function getDebtStats() {
  const open = await listOpenDebts();
  return computeAppointmentDebtStats(open);
}

/**
 * Marca el turno como cobrado (efectivo o comprobante).
 * Misma fuente de verdad que finalizar cobro en la agenda.
 */
export async function markDebtPaid(params: {
  appointmentId: number;
  paymentMethod: "efectivo" | "comprobante_digital";
  paymentReceiptUrl?: string | null;
  paymentReceiptName?: string | null;
}) {
  const existing = await agendaDb.getAppointmentById(params.appointmentId);
  if (!existing) throw new Error("Turno no encontrado");
  if (existing.status === "cancelado") throw new Error("El turno está cancelado");
  if (existing.paymentStatus === "pagado") {
    return appointmentToDebt(existing as any);
  }
  if (existing.paymentStatus !== "falta_pagar") {
    throw new Error("Este turno no figura como falta pagar en la agenda");
  }

  const updated = await agendaDb.finalizeAppointmentWithPayment({
    id: params.appointmentId,
    paymentStatus: "pagado",
    paymentMethod: params.paymentMethod,
    paymentReceiptUrl: params.paymentReceiptUrl ?? null,
    paymentReceiptName: params.paymentReceiptName ?? null,
  });

  // Best practice: cobranza de agenda → posteo en caja (efectivo), idempotente.
  if (params.paymentMethod === "efectivo") {
    try {
      const { createCashMovement, listCashMovements } = await import("./cashLedgerDb");
      const code = String(existing.code || `#${existing.id}`);
      const tag = `[AGENDA:${code}]`;
      const already = await listCashMovements({ search: tag });
      if (already.length === 0) {
        const amount = Math.max(0, Math.round(Number(existing.servicePrice) || 0));
        if (amount > 0) {
          await createCashMovement({
            type: "ingreso",
            amount,
            movementDate: String(existing.scheduledDate || new Date().toISOString().slice(0, 10)),
            person: String(existing.clientName || "Cliente"),
            category: "Cobro manual",
            description: `Cobro agenda ${code} · ${existing.clientName || ""} ${tag}`.trim(),
          });
        }
      }
    } catch (err) {
      console.error("[erp] posteo caja al cobrar falló", err);
    }
  }

  return appointmentToDebt(updated as any);
}

/** @deprecated Mantener exports vacíos por si algún import viejo queda; no usar. */
export async function listReceivables() {
  return listDebts({ includeCollected: false });
}

export async function getReceivableStats() {
  return getDebtStats();
}
