/**
 * Al marcar un turno como pagado (agenda o deudores), anota el ingreso en caja.
 * Un turno = un movimiento, con la marca [AGENDA:código].
 */
import { asuncionDate, planAgendaCashSync } from "../shared/agendaCash";
import {
  createCashMovement,
  deleteCashMovement,
  listCashMovements,
  updateCashMovement,
} from "./cashLedgerDb";

export async function syncAgendaPaymentToCash(params: {
  code: string;
  clientName: string;
  amount: number;
  paymentStatus: string;
  paymentMethod?: "efectivo" | "comprobante_digital" | null;
  scheduledDate?: string;
  movementDate?: string;
}) {
  const rows = await listCashMovements({});
  const plan = planAgendaCashSync({
    rows,
    code: params.code,
    clientName: params.clientName,
    amount: params.amount,
    paymentStatus: params.paymentStatus,
    paymentMethod: params.paymentMethod,
    movementDate: params.movementDate || asuncionDate(),
    scheduledDate: params.scheduledDate,
  });

  if (plan.action === "noop") return;
  if (plan.action === "delete") {
    for (const id of plan.ids) await deleteCashMovement(id);
    return;
  }
  if (plan.action === "create") {
    await createCashMovement(plan.input);
    return;
  }
  await updateCashMovement(plan.id, plan.input);
  for (const id of plan.deleteIds) await deleteCashMovement(id);
}
