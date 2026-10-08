/** Cierre del día: qué debería haber en el cajón y qué se contó. */

export interface CashDayRow {
  type: "ingreso" | "egreso" | string;
  amount: number;
  movementDate: string;
  description?: string | null;
}

export interface CashDaySummary {
  date: string;
  efectivoIn: number;
  comprobanteIn: number;
  egresos: number;
  /** Efectivo que entró menos lo que salió. El comprobante no está en el cajón. */
  expectedDrawer: number;
}

export function isDrawerIncome(row: Pick<CashDayRow, "type" | "description">): boolean {
  if (row.type !== "ingreso") return false;
  return !String(row.description || "").toLowerCase().includes("comprobante");
}

export function summarizeCashDay(rows: CashDayRow[], date: string): CashDaySummary {
  let efectivoIn = 0;
  let comprobanteIn = 0;
  let egresos = 0;
  for (const row of rows) {
    if (row.movementDate !== date) continue;
    const amount = Math.max(0, Math.round(Number(row.amount) || 0));
    if (row.type === "egreso") {
      egresos += amount;
    } else if (row.type === "ingreso" && isDrawerIncome(row)) {
      efectivoIn += amount;
    } else if (row.type === "ingreso") {
      comprobanteIn += amount;
    }
  }
  return {
    date,
    efectivoIn,
    comprobanteIn,
    egresos,
    expectedDrawer: efectivoIn - egresos,
  };
}

export function cashDifference(expectedDrawer: number, counted: number): number {
  return Math.round(counted) - Math.round(expectedDrawer);
}
