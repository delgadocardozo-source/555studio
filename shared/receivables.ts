/** Deudores automáticos: servicios de la agenda sin pagar (falta_pagar). */

export type AppointmentDebtStatus = "pendiente" | "cobrado";

export interface AppointmentDebt {
  /** ID del turno en agenda */
  appointmentId: number;
  code: string;
  clientName: string;
  clientPhone: string;
  scheduledDate: string;
  timeSlot: string;
  vehicleSummary: string;
  serviceStatus: string;
  amount: number;
  amountPaid: number;
  status: AppointmentDebtStatus;
  paymentStatus: string;
  notes: string;
}

export interface AppointmentDebtLike {
  id: number;
  code?: string | null;
  clientName: string;
  clientPhone: string;
  scheduledDate: string;
  timeSlot?: string | null;
  vehicleType?: string | null;
  vehicleModel?: string | null;
  vehicleCount?: number | null;
  vehicles?: string | null;
  servicePrice?: number | null;
  status: string;
  paymentStatus?: string | null;
  notes?: string | null;
}

export function remainingOf(row: Pick<AppointmentDebt, "amount" | "amountPaid">): number {
  return Math.max(0, Number(row.amount || 0) - Number(row.amountPaid || 0));
}

function vehicleSummaryFrom(row: AppointmentDebtLike): string {
  if (row.vehicles) {
    try {
      const parsed = typeof row.vehicles === "string" ? JSON.parse(row.vehicles) : row.vehicles;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((v: any) => {
            const t = v?.type === "camioneta" ? "camioneta" : "auto";
            const model = String(v?.model || "").trim();
            return model ? `${t} ${model}` : t;
          })
          .join(" · ");
      }
    } catch {
      /* fallthrough */
    }
  }
  const count = Math.max(1, Number(row.vehicleCount) || 1);
  const type = row.vehicleType === "camioneta" ? "camioneta" : "auto";
  const model = String(row.vehicleModel || "").trim();
  const base = model ? `${type} ${model}` : type;
  return count > 1 ? `${base} (+${count - 1})` : base;
}

/** Turno que genera deuda abierta. */
export function isOpenAppointmentDebt(row: AppointmentDebtLike): boolean {
  if (row.status === "cancelado") return false;
  return String(row.paymentStatus || "") === "falta_pagar";
}

/** Historial reciente cobrado (para filtro “cobradas”). */
export function isCollectedAppointmentDebt(row: AppointmentDebtLike): boolean {
  if (row.status === "cancelado") return false;
  return String(row.paymentStatus || "") === "pagado" && row.status === "finalizado";
}

export function appointmentToDebt(row: AppointmentDebtLike): AppointmentDebt {
  const amount = Math.max(0, Math.round(Number(row.servicePrice) || 0));
  const paid = String(row.paymentStatus || "") === "pagado" ? amount : 0;
  return {
    appointmentId: Number(row.id),
    code: String(row.code || `#${row.id}`),
    clientName: String(row.clientName || ""),
    clientPhone: String(row.clientPhone || ""),
    scheduledDate: String(row.scheduledDate || ""),
    timeSlot: String(row.timeSlot || ""),
    vehicleSummary: vehicleSummaryFrom(row),
    serviceStatus: String(row.status || ""),
    amount,
    amountPaid: paid,
    status: paid > 0 && paid >= amount ? "cobrado" : "pendiente",
    paymentStatus: String(row.paymentStatus || "sin_definir"),
    notes: String(row.notes || ""),
  };
}

export function listOpenDebtsFromAppointments(rows: AppointmentDebtLike[]): AppointmentDebt[] {
  return rows
    .filter(isOpenAppointmentDebt)
    .map(appointmentToDebt)
    .sort((a, b) => String(b.scheduledDate).localeCompare(String(a.scheduledDate)));
}

export function listCollectedDebtsFromAppointments(
  rows: AppointmentDebtLike[],
  limit = 40
): AppointmentDebt[] {
  return rows
    .filter(isCollectedAppointmentDebt)
    .map(appointmentToDebt)
    .sort((a, b) => String(b.scheduledDate).localeCompare(String(a.scheduledDate)))
    .slice(0, limit);
}

export function computeAppointmentDebtStats(openRows: AppointmentDebt[]) {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = openRows.filter((r) => r.scheduledDate && r.scheduledDate < today);
  const pendingGs = openRows.reduce((sum, r) => sum + remainingOf(r), 0);
  return {
    openCount: openRows.length,
    overdueCount: overdue.length,
    pendingGs,
  };
}

export function formatGs(amount: number): string {
  return `${Number(amount || 0).toLocaleString("es-PY")} Gs.`;
}
