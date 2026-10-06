import { describe, expect, it } from "vitest";
import { computeInventoryStats, type InventoryItem } from "../shared/inventory";
import {
  computeReceivableStats,
  deriveReceivableStatus,
  remainingOf,
  type Receivable,
} from "../shared/receivables";
import { matchSupplierSearch, type Supplier } from "../shared/suppliers";

const items: InventoryItem[] = [
  {
    id: 1,
    name: "Shampoo",
    category: "Químicos",
    unit: "lt",
    stock: 2,
    minStock: 5,
    unitCost: 50000,
    notes: "",
    active: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: 2,
    name: "Cera",
    category: "Ceras / selladores",
    unit: "unid",
    stock: 10,
    minStock: 2,
    unitCost: 80000,
    notes: "",
    active: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: 3,
    name: "Viejo",
    category: "Otros",
    unit: "unid",
    stock: 0,
    minStock: 0,
    unitCost: 1000,
    notes: "",
    active: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
];

describe("inventory stats", () => {
  it("detecta bajo stock y valúa activos", () => {
    const stats = computeInventoryStats(items);
    expect(stats.itemsActive).toBe(2);
    expect(stats.itemsTotal).toBe(3);
    expect(stats.lowStockCount).toBe(1);
    expect(stats.lowStock[0]?.name).toBe("Shampoo");
    expect(stats.stockValueGs).toBe(2 * 50000 + 10 * 80000);
  });
});

describe("receivables", () => {
  const rows: Receivable[] = [
    {
      id: 1,
      clientName: "Ana",
      clientPhone: "",
      concept: "Detail",
      amount: 500000,
      amountPaid: 0,
      dueDate: "2020-01-01",
      status: "pendiente",
      notes: "",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: 2,
      clientName: "Bob",
      clientPhone: "",
      concept: "Lavado",
      amount: 200000,
      amountPaid: 50000,
      dueDate: "2099-01-01",
      status: "parcial",
      notes: "",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: 3,
      clientName: "Cata",
      clientPhone: "",
      concept: "Full",
      amount: 100000,
      amountPaid: 100000,
      dueDate: "2026-09-01",
      status: "cobrado",
      notes: "",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ];

  it("calcula restante y deriva estado", () => {
    expect(remainingOf(rows[0])).toBe(500000);
    expect(remainingOf(rows[1])).toBe(150000);
    expect(deriveReceivableStatus({ amount: 100, amountPaid: 40, status: "pendiente" })).toBe(
      "parcial"
    );
    expect(deriveReceivableStatus({ amount: 100, amountPaid: 100, status: "pendiente" })).toBe(
      "cobrado"
    );
    expect(deriveReceivableStatus({ amount: 100, amountPaid: 0, status: "anulado" })).toBe(
      "anulado"
    );
  });

  it("resume abiertas, vencidas y montos", () => {
    const stats = computeReceivableStats(rows);
    expect(stats.openCount).toBe(2);
    expect(stats.overdueCount).toBe(1);
    expect(stats.pendingGs).toBe(650000);
    expect(stats.collectedGs).toBe(150000);
  });
});

describe("suppliers search", () => {
  const row: Supplier = {
    id: 1,
    name: "Química Norte",
    phone: "0981",
    category: "Químicos",
    notes: "entrega martes",
    active: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };

  it("matchea por nombre o categoría", () => {
    expect(matchSupplierSearch(row, "norte")).toBe(true);
    expect(matchSupplierSearch(row, "químicos")).toBe(true);
    expect(matchSupplierSearch(row, "xyz")).toBe(false);
    expect(matchSupplierSearch(row)).toBe(true);
  });
});
