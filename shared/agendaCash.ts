/** Cobro de un turno → un ingreso de caja, identificado por [AGENDA:código]. */

import type { CashMovement, CashMovementInput } from "./cashLedger";

export const AGENDA_CASH_CATEGORY = "Cobro agenda";

export function agendaCashTag(code: string): string {
  return `[AGENDA:${code}]`;
}

/** Fecha de caja en Paraguay, no en UTC. */
export function asuncionDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Asuncion",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

type CashRow = Pick<CashMovement, "id" | "type" | "amount" | "movementDate" | "person" | "description">;

export type AgendaCashPlan =
  | { action: "noop" }
  | { action: "delete"; ids: number[] }
  | { action: "create"; input: CashMovementInput }
  | { action: "update"; id: number; input: CashMovementInput; deleteIds: number[] };

function methodLabel(method: "efectivo" | "comprobante_digital"): string {
  return method === "comprobante_digital" ? "comprobante" : "efectivo";
}

export function planAgendaCashSync(params: {
  rows: CashRow[];
  code: string;
  clientName: string;
  amount: number;
  paymentStatus: string;
  paymentMethod?: "efectivo" | "comprobante_digital" | null;
  movementDate: string;
  scheduledDate?: string;
}): AgendaCashPlan {
  const code = String(params.code || "").trim();
  if (!code) return { action: "noop" };

  const tag = agendaCashTag(code);
  const tagged = params.rows.filter((row) => String(row.description || "").includes(tag));
  const amount = Math.round(Number(params.amount) || 0);
  const paid =
    params.paymentStatus === "pagado" &&
    (params.paymentMethod === "efectivo" || params.paymentMethod === "comprobante_digital") &&
    amount > 0;

  if (!paid) {
    if (tagged.length === 0) return { action: "noop" };
    return { action: "delete", ids: tagged.map((row) => row.id) };
  }

  const person = String(params.clientName || "").trim() || "Cliente";
  const description = `Cobro agenda ${code} · ${person} · ${methodLabel(params.paymentMethod!)} ${tag}`;
  const inputFor = (movementDate: string): CashMovementInput => ({
    type: "ingreso",
    amount,
    movementDate,
    person,
    category: AGENDA_CASH_CATEGORY,
    description,
  });

  if (tagged.length > 0) {
    const [keep, ...rest] = tagged;
    return {
      action: "update",
      id: keep.id,
      input: inputFor(keep.movementDate),
      deleteIds: rest.map((row) => row.id),
    };
  }

  const dates = new Set(
    [params.movementDate, params.scheduledDate].map((value) => String(value || "").trim()).filter(Boolean)
  );
  const twin = params.rows.find((row) => {
    if (row.type !== "ingreso") return false;
    if (Math.round(Number(row.amount) || 0) !== amount) return false;
    if (String(row.person || "").trim().toLowerCase() !== person.toLowerCase()) return false;
    if (!dates.has(String(row.movementDate || ""))) return false;
    if (String(row.description || "").includes("[AGENDA:")) return false;
    return true;
  });
  if (twin) {
    return {
      action: "update",
      id: twin.id,
      input: inputFor(twin.movementDate),
      deleteIds: [],
    };
  }

  return { action: "create", input: inputFor(params.movementDate) };
}
