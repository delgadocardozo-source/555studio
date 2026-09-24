import { describe, expect, it } from "vitest";
import { buildCashLedgerText } from "../client/src/lib/cashLedgerPdf";
import type { CashMovement } from "../shared/cashLedger";

const sample: CashMovement[] = [
  {
    id: 1,
    type: "ingreso",
    amount: 120000,
    movementDate: "2026-09-24",
    person: "Marcelo Añazco",
    category: "Cobro manual",
    description: "Fortuner",
    createdAt: "2026-09-24T10:00:00.000Z",
    updatedAt: "2026-09-24T10:00:00.000Z",
  },
  {
    id: 2,
    type: "egreso",
    amount: 140000,
    movementDate: "2026-09-24",
    person: "Producto de Limpieza",
    category: "Insumos",
    description: "",
    createdAt: "2026-09-24T11:00:00.000Z",
    updatedAt: "2026-09-24T11:00:00.000Z",
  },
];

describe("cashLedgerPdf", () => {
  it("arma texto con totales e ingresos/egresos", () => {
    const text = buildCashLedgerText(sample, { type: "todos" });
    expect(text).toContain("555 DETAIL STUDIO");
    expect(text).toContain("Ingresos y Egresos");
    expect(text).toContain("Marcelo Añazco");
    expect(text).toContain("Producto de Limpieza");
    expect(text).toContain("120.000");
    expect(text).toContain("140.000");
  });

  it("respeta filtro en el encabezado", () => {
    const text = buildCashLedgerText(sample, {
      person: "Marcelo",
      dateFrom: "2026-09-24",
      dateTo: "2026-09-24",
    });
    expect(text).toContain("Persona: Marcelo");
    expect(text).toContain("24 de septiembre de 2026");
  });
});
