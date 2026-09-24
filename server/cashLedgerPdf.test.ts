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

  it("separa ingresos y egresos en el texto", () => {
    const text = buildCashLedgerText(sample, { type: "todos" });
    const ingresosIdx = text.indexOf("INGRESOS");
    const egresosIdx = text.indexOf("EGRESOS");
    expect(ingresosIdx).toBeGreaterThan(-1);
    expect(egresosIdx).toBeGreaterThan(ingresosIdx);
    const ingresoBlock = text.slice(ingresosIdx, egresosIdx);
    const egresoBlock = text.slice(egresosIdx);
    expect(ingresoBlock).toContain("Marcelo Añazco");
    expect(ingresoBlock).not.toContain("Producto de Limpieza");
    expect(egresoBlock).toContain("Producto de Limpieza");
    expect(egresoBlock).not.toContain("Marcelo Añazco");
  });
});
