/** Tipos y helpers del módulo de caja (ingresos / egresos). Independiente de la agenda. */

export type CashMovementType = "ingreso" | "egreso";

export const CASH_EGRESO_CATEGORIES = [
  "Insumos",
  "Combustible",
  "Herramientas",
  "Compras varias",
  "Sueldos",
  "Mantenimiento",
  "Otros",
] as const;

export const CASH_INGRESO_CATEGORIES = [
  "Aporte",
  "Cobro manual",
  "Reintegro",
  "Otros",
] as const;

export interface CashMovement {
  id: number;
  type: CashMovementType;
  amount: number;
  movementDate: string; // YYYY-MM-DD
  person: string;
  category: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashMovementInput {
  type: CashMovementType;
  amount: number;
  movementDate: string;
  person: string;
  category: string;
  description?: string;
}

export interface CashLedgerFilters {
  type?: CashMovementType | "todos";
  person?: string;
  category?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface CashLedgerStats {
  totalIngresos: number;
  totalEgresos: number;
  balance: number;
  count: number;
  byPerson: Array<{
    person: string;
    ingresos: number;
    egresos: number;
    balance: number;
    movements: number;
  }>;
}

export function categoriesForType(type: CashMovementType): readonly string[] {
  return type === "egreso" ? CASH_EGRESO_CATEGORIES : CASH_INGRESO_CATEGORIES;
}

export function formatGs(amount: number): string {
  return `${Number(amount || 0).toLocaleString("es-PY")} Gs.`;
}

export function computeCashStats(rows: CashMovement[]): CashLedgerStats {
  let totalIngresos = 0;
  let totalEgresos = 0;
  const personMap = new Map<string, { ingresos: number; egresos: number; movements: number }>();

  for (const row of rows) {
    const person = (row.person || "Sin nombre").trim() || "Sin nombre";
    const bucket = personMap.get(person) || { ingresos: 0, egresos: 0, movements: 0 };
    bucket.movements += 1;
    if (row.type === "ingreso") {
      totalIngresos += row.amount;
      bucket.ingresos += row.amount;
    } else {
      totalEgresos += row.amount;
      bucket.egresos += row.amount;
    }
    personMap.set(person, bucket);
  }

  const byPerson = Array.from(personMap.entries())
    .map(([person, v]) => ({
      person,
      ingresos: v.ingresos,
      egresos: v.egresos,
      balance: v.ingresos - v.egresos,
      movements: v.movements,
    }))
    .sort((a, b) => b.egresos - a.egresos || a.person.localeCompare(b.person));

  return {
    totalIngresos,
    totalEgresos,
    balance: totalIngresos - totalEgresos,
    count: rows.length,
    byPerson,
  };
}

export function matchCashFilters(row: CashMovement, filters: CashLedgerFilters = {}): boolean {
  if (filters.type && filters.type !== "todos" && row.type !== filters.type) return false;
  if (filters.person && filters.person.trim()) {
    const q = filters.person.trim().toLowerCase();
    if (!(row.person || "").toLowerCase().includes(q)) return false;
  }
  if (filters.category && filters.category.trim() && filters.category !== "Todas") {
    if (row.category !== filters.category) return false;
  }
  if (filters.dateFrom && row.movementDate < filters.dateFrom) return false;
  if (filters.dateTo && row.movementDate > filters.dateTo) return false;
  if (filters.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    const hay = `${row.person} ${row.category} ${row.description}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}
