/** Cuentas por cobrar (deudores) — ERP aparte; luego se conecta a la agenda. */

export type ReceivableStatus = "pendiente" | "parcial" | "cobrado" | "anulado";

export interface Receivable {
  id: number;
  clientName: string;
  clientPhone: string;
  concept: string;
  amount: number;
  amountPaid: number;
  dueDate: string;
  status: ReceivableStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceivableInput {
  clientName: string;
  clientPhone?: string;
  concept: string;
  amount: number;
  amountPaid?: number;
  dueDate: string;
  status?: ReceivableStatus;
  notes?: string;
}

export function remainingOf(row: Receivable): number {
  return Math.max(0, Number(row.amount || 0) - Number(row.amountPaid || 0));
}

export function deriveReceivableStatus(row: Pick<Receivable, "amount" | "amountPaid" | "status">): ReceivableStatus {
  if (row.status === "anulado") return "anulado";
  const remaining = Math.max(0, Number(row.amount || 0) - Number(row.amountPaid || 0));
  if (remaining <= 0) return "cobrado";
  if (Number(row.amountPaid || 0) > 0) return "parcial";
  return "pendiente";
}

export function computeReceivableStats(rows: Receivable[]) {
  const open = rows.filter((r) => r.status !== "anulado" && r.status !== "cobrado");
  const pendingGs = open.reduce((sum, r) => sum + remainingOf(r), 0);
  const collectedGs = rows
    .filter((r) => r.status !== "anulado")
    .reduce((sum, r) => sum + Number(r.amountPaid || 0), 0);
  const overdue = open.filter((r) => r.dueDate && r.dueDate < new Date().toISOString().slice(0, 10));
  return {
    openCount: open.length,
    overdueCount: overdue.length,
    pendingGs,
    collectedGs,
  };
}

export function formatGs(amount: number): string {
  return `${Number(amount || 0).toLocaleString("es-PY")} Gs.`;
}
