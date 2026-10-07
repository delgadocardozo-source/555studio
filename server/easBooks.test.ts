import { describe, expect, it } from "vitest";
import {
  buildEasPurchase,
  buildInventoryBook,
  buildIvaPosition,
  buildJournal,
  buildLedger,
  buildSalesBook,
  ledgerTotals,
  regimeChargesIva,
} from "../shared/easBooks";

const sale = {
  number: "CS-000001",
  status: "emitida",
  issuedDate: "2026-10-03",
  clientName: "Ale",
  clientTaxId: "80012345-6",
  taxableBase: 81818,
  ivaAmount: 8182,
  total: 90000,
  paymentStatus: "pagado",
};

describe("libros EAS", () => {
  it("el libro de ventas ignora anulados y arma el débito fiscal", () => {
    const book = buildSalesBook(
      [sale, { ...sale, number: "CS-000002", status: "anulada" }],
      "2026-10"
    );
    expect(book).toHaveLength(1);
    const iva = buildIvaPosition("simple", book, []);
    expect(iva.applies).toBe(true);
    expect(iva.debitoFiscal).toBe(8182);
    expect(iva.aPagar).toBe(8182);
  });

  it("RESIMPLE no liquida IVA", () => {
    expect(regimeChargesIva("resimple")).toBe(false);
    const book = buildSalesBook([sale], "2026-10");
    const iva = buildIvaPosition("resimple", book, []);
    expect(iva.applies).toBe(false);
    expect(iva.aPagar).toBe(0);
  });

  it("la compra calcula IVA 10% y 5% sobre la base", () => {
    const buy = buildEasPurchase(
      {
        date: "2026-10-04",
        supplierName: "Química SA",
        supplierRuc: "80099999-1",
        voucherNumber: "001-001-0000123",
        taxed10: 100000,
        taxed5: 20000,
        exempt: 5000,
      },
      1,
      "2026-10-04T00:00:00.000Z"
    );
    expect(buy.iva10).toBe(10000);
    expect(buy.iva5).toBe(1000);
    expect(buy.total).toBe(136000);
  });

  it("el diario cierra: debe igual a haber", () => {
    const sales = buildSalesBook([sale, { ...sale, number: "CS-000003", paymentStatus: "falta_pagar", total: 120000, taxableBase: 109091, ivaAmount: 10909 }], "2026-10");
    const buy = buildEasPurchase(
      {
        date: "2026-10-04",
        supplierName: "Química SA",
        voucherNumber: "123",
        taxed10: 100000,
      },
      1,
      "2026-10-04T00:00:00.000Z"
    );
    const journal = buildJournal({
      regime: "general",
      sales,
      purchases: [buy],
      payroll: [{ id: 7, paymentDate: "2026-10-15", staffName: "Juan", amount: 500000, concept: "Quincena" }],
    });
    const totals = ledgerTotals(buildLedger(journal));
    expect(totals.debit).toBe(totals.credit);
    expect(journal.some((e) => e.id === "cobro-CS-000001")).toBe(true);
    expect(journal.some((e) => e.id === "cobro-CS-000003")).toBe(false);
    const iva = buildIvaPosition("general", sales, [buy]);
    expect(iva.creditoFiscal).toBe(10000);
    expect(iva.saldo).toBe(8182 + 10909 - 10000);
  });

  it("el inventario valora existencias y marca costo faltante", () => {
    const book = buildInventoryBook([
      { name: "Shampoo", unit: "lt", stock: 2, unitCost: 50000, active: true },
      { name: "Cera", unit: "unid", stock: 0, unitCost: 80000, active: true },
      { name: "Paño", unit: "unid", stock: 4, unitCost: null, active: true },
    ]);
    expect(book.lines).toHaveLength(2);
    expect(book.totalValue).toBe(100000);
    expect(book.lines.find((l) => l.name === "Paño")?.missingCost).toBe(true);
  });
});
