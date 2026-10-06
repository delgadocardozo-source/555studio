/** Nómina / pagos a personal — módulo ERP aparte de agenda y caja general. */

export const STAFF_ROLES = [
  "Lavador",
  "Supervisor",
  "Administración",
  "Otro",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_PAY_TYPES = [
  "diario",
  "semanal",
  "quincenal",
  "mensual",
  "variable",
] as const;

export type StaffPayType = (typeof STAFF_PAY_TYPES)[number];

export const PAYMENT_CONCEPTS = [
  "Quincena",
  "Semana",
  "Mes",
  "Día",
  "Adelanto",
  "Bono",
  "Comisión",
  "Otro",
] as const;

export type PaymentConcept = (typeof PAYMENT_CONCEPTS)[number];

export interface StaffMember {
  id: number;
  name: string;
  role: string;
  payType: StaffPayType;
  /** Monto de referencia (opcional), en Gs. */
  baseAmount: number | null;
  active: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffMemberInput {
  name: string;
  role?: string;
  payType?: StaffPayType;
  baseAmount?: number | null;
  active?: boolean;
  notes?: string;
}

export interface StaffPayment {
  id: number;
  staffId: number;
  staffName: string;
  amount: number;
  paymentDate: string; // YYYY-MM-DD
  concept: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffPaymentInput {
  staffId: number;
  amount: number;
  paymentDate: string;
  concept: string;
  notes?: string;
}

export interface PayrollFilters {
  staffId?: number;
  dateFrom?: string;
  dateTo?: string;
  concept?: string;
  search?: string;
}

export interface StaffPaySummary {
  staffId: number;
  staffName: string;
  role: string;
  active: boolean;
  payments: number;
  totalPaid: number;
  lastPaymentDate: string | null;
}

export interface PayrollStats {
  staffActive: number;
  staffTotal: number;
  paymentsCount: number;
  totalPaid: number;
  byStaff: StaffPaySummary[];
}

export function formatGs(amount: number): string {
  return `${Number(amount || 0).toLocaleString("es-PY")} Gs.`;
}

export function payTypeLabel(payType: string): string {
  switch (payType) {
    case "diario":
      return "Diario";
    case "semanal":
      return "Semanal";
    case "quincenal":
      return "Quincenal";
    case "mensual":
      return "Mensual";
    case "variable":
      return "Variable";
    default:
      return payType || "—";
  }
}

export function matchPaymentFilters(
  row: StaffPayment,
  filters: PayrollFilters = {}
): boolean {
  if (filters.staffId != null && row.staffId !== filters.staffId) return false;
  if (filters.dateFrom && row.paymentDate < filters.dateFrom) return false;
  if (filters.dateTo && row.paymentDate > filters.dateTo) return false;
  if (filters.concept && filters.concept !== "Todos" && row.concept !== filters.concept) {
    return false;
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    const hay = `${row.staffName} ${row.concept} ${row.notes}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function computePayrollStats(
  staff: StaffMember[],
  payments: StaffPayment[]
): PayrollStats {
  const byId = new Map<number, StaffPaySummary>();

  for (const s of staff) {
    byId.set(s.id, {
      staffId: s.id,
      staffName: s.name,
      role: s.role,
      active: s.active,
      payments: 0,
      totalPaid: 0,
      lastPaymentDate: null,
    });
  }

  let totalPaid = 0;
  for (const p of payments) {
    totalPaid += p.amount;
    let bucket = byId.get(p.staffId);
    if (!bucket) {
      bucket = {
        staffId: p.staffId,
        staffName: p.staffName,
        role: "—",
        active: false,
        payments: 0,
        totalPaid: 0,
        lastPaymentDate: null,
      };
      byId.set(p.staffId, bucket);
    }
    bucket.payments += 1;
    bucket.totalPaid += p.amount;
    if (!bucket.lastPaymentDate || p.paymentDate > bucket.lastPaymentDate) {
      bucket.lastPaymentDate = p.paymentDate;
    }
  }

  const byStaff = Array.from(byId.values()).sort(
    (a, b) => b.totalPaid - a.totalPaid || a.staffName.localeCompare(b.staffName)
  );

  return {
    staffActive: staff.filter((s) => s.active).length,
    staffTotal: staff.length,
    paymentsCount: payments.length,
    totalPaid,
    byStaff,
  };
}
