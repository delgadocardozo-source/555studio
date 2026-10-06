/** Fidelización: 5 lavados finalizados en el mes → 1 lavado gratis. */

export const LOYALTY_WASHES_PER_REWARD = 5;

export interface LoyaltyWashRow {
  scheduledDate: string;
  status: string;
  paymentStatus?: string | null;
  servicePrice?: number | null;
  /** Marcado cuando el turno usó crédito de fidelización. */
  loyaltyFree?: boolean | number | null;
  notes?: string | null;
}

export interface LoyaltyStatus {
  monthKey: string;
  washesThisMonth: number;
  rewardsEarned: number;
  rewardsUsed: number;
  freeWashCredits: number;
  nextRewardIn: number;
  eligibleForFreeWash: boolean;
}

export function monthKeyFromDate(isoDate: string = new Date().toISOString().slice(0, 10)): string {
  return String(isoDate || "").slice(0, 7);
}

export function isLoyaltyFreeAppointment(row: LoyaltyWashRow): boolean {
  if (row.loyaltyFree === true || row.loyaltyFree === 1) return true;
  const notes = String(row.notes || "");
  return notes.includes("[LOYALTY_FREE]");
}

/** Cuenta lavados finalizados del mes (no cancelados). */
export function countFinalizedWashesInMonth(rows: LoyaltyWashRow[], monthKey: string): number {
  return rows.filter(
    (r) => r.status === "finalizado" && monthKeyFromDate(r.scheduledDate) === monthKey
  ).length;
}

export function countLoyaltyFreeUsedInMonth(rows: LoyaltyWashRow[], monthKey: string): number {
  return rows.filter(
    (r) =>
      r.status !== "cancelado" &&
      monthKeyFromDate(r.scheduledDate) === monthKey &&
      isLoyaltyFreeAppointment(r)
  ).length;
}

export function computeLoyaltyStatus(
  rows: LoyaltyWashRow[],
  opts?: { monthKey?: string; storedCredits?: number }
): LoyaltyStatus {
  const monthKey = opts?.monthKey || monthKeyFromDate();
  const washesThisMonth = countFinalizedWashesInMonth(rows, monthKey);
  const rewardsEarned = Math.floor(washesThisMonth / LOYALTY_WASHES_PER_REWARD);
  const rewardsUsed = countLoyaltyFreeUsedInMonth(rows, monthKey);
  const fromHistory = Math.max(0, rewardsEarned - rewardsUsed);
  // Si hay créditos persistidos, usamos el máximo (historia vs store) para no perder premios.
  const freeWashCredits = Math.max(fromHistory, Math.max(0, opts?.storedCredits ?? 0));
  const nextRewardIn =
    washesThisMonth % LOYALTY_WASHES_PER_REWARD === 0 && washesThisMonth > 0
      ? LOYALTY_WASHES_PER_REWARD
      : LOYALTY_WASHES_PER_REWARD - (washesThisMonth % LOYALTY_WASHES_PER_REWARD);

  return {
    monthKey,
    washesThisMonth,
    rewardsEarned,
    rewardsUsed,
    freeWashCredits,
    nextRewardIn,
    eligibleForFreeWash: freeWashCredits > 0,
  };
}

export function catalogPriceForVehicle(type: "auto" | "camioneta"): number {
  return type === "camioneta" ? 120000 : 90000;
}

/** Aplica 1 lavado gratis al vehículo más caro (o el primero). */
export function applyFreeWashToVehicles<T extends { type: "auto" | "camioneta"; price: number }>(
  vehicles: T[]
): { vehicles: T[]; total: number; applied: boolean } {
  if (!vehicles.length) return { vehicles, total: 0, applied: false };
  let bestIdx = 0;
  let bestPrice = -1;
  vehicles.forEach((v, i) => {
    const p = catalogPriceForVehicle(v.type);
    if (p > bestPrice) {
      bestPrice = p;
      bestIdx = i;
    }
  });
  const next = vehicles.map((v, i) =>
    i === bestIdx ? { ...v, price: 0 } : { ...v, price: catalogPriceForVehicle(v.type) }
  );
  const total = next.reduce((s, v) => s + v.price, 0);
  return { vehicles: next, total, applied: true };
}

export function withLoyaltyFreeNote(notes: string | null | undefined): string {
  const base = String(notes || "").trim();
  if (base.includes("[LOYALTY_FREE]")) return base;
  return base ? `${base}\n[LOYALTY_FREE]` : "[LOYALTY_FREE]";
}
