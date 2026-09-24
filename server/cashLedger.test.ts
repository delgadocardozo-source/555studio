import { describe, expect, it } from "vitest";
import {
  computeCashStats,
  matchCashFilters,
  type CashMovement,
} from "../shared/cashLedger";

function row(partial: Partial<CashMovement> & Pick<CashMovement, "id" | "type" | "amount" | "person">): CashMovement {
  return {
    movementDate: "2026-09-24",
    category: "Insumos",
    description: "",
    createdAt: "2026-09-24T12:00:00.000Z",
    updatedAt: "2026-09-24T12:00:00.000Z",
    ...partial,
  };
}

describe("cashLedger helpers", () => {
  it("agrega ingresos/egresos y desglosa por persona", () => {
    const stats = computeCashStats([
      row({ id: 1, type: "egreso", amount: 100000, person: "Juan" }),
      row({ id: 2, type: "egreso", amount: 50000, person: "Juan", category: "Combustible" }),
      row({ id: 3, type: "ingreso", amount: 200000, person: "Ana" }),
      row({ id: 4, type: "egreso", amount: 30000, person: "Ana" }),
    ]);

    expect(stats.totalEgresos).toBe(180000);
    expect(stats.totalIngresos).toBe(200000);
    expect(stats.balance).toBe(20000);
    expect(stats.count).toBe(4);

    const juan = stats.byPerson.find((p) => p.person === "Juan");
    expect(juan?.egresos).toBe(150000);
    expect(juan?.ingresos).toBe(0);
    expect(juan?.movements).toBe(2);
  });

  it("filtra por persona y tipo", () => {
    const rows = [
      row({ id: 1, type: "egreso", amount: 10, person: "Juan" }),
      row({ id: 2, type: "ingreso", amount: 20, person: "Juan" }),
      row({ id: 3, type: "egreso", amount: 30, person: "Ana" }),
    ];
    expect(rows.filter((r) => matchCashFilters(r, { person: "juan", type: "egreso" }))).toHaveLength(1);
    expect(rows.filter((r) => matchCashFilters(r, { type: "ingreso" }))).toHaveLength(1);
  });
});
