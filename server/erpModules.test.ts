import { describe, expect, it } from "vitest";
import { computeInventoryStats, type InventoryItem } from "../shared/inventory";
import {
  computeAppointmentDebtStats,
  listOpenDebtsFromAppointments,
  remainingOf,
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

describe("receivables (auto from agenda)", () => {
  const appointments = [
    {
      id: 1,
      code: "A1",
      clientName: "Ana",
      clientPhone: "0981",
      scheduledDate: "2020-01-01",
      timeSlot: "08:00 - 09:20",
      vehicleType: "auto",
      vehicleModel: "Corolla",
      vehicleCount: 1,
      servicePrice: 90000,
      status: "finalizado",
      paymentStatus: "falta_pagar",
      notes: "",
    },
    {
      id: 2,
      code: "B2",
      clientName: "Bob",
      clientPhone: "0982",
      scheduledDate: "2099-01-01",
      timeSlot: "10:00 - 11:20",
      vehicleType: "camioneta",
      vehicleModel: "Hilux",
      vehicleCount: 1,
      servicePrice: 120000,
      status: "finalizado",
      paymentStatus: "falta_pagar",
      notes: "",
    },
    {
      id: 3,
      code: "C3",
      clientName: "Cata",
      clientPhone: "0983",
      scheduledDate: "2026-09-01",
      timeSlot: "12:00 - 13:20",
      vehicleType: "auto",
      vehicleModel: "Onix",
      vehicleCount: 1,
      servicePrice: 90000,
      status: "finalizado",
      paymentStatus: "pagado",
      notes: "",
    },
    {
      id: 4,
      code: "D4",
      clientName: "Dan",
      clientPhone: "0984",
      scheduledDate: "2026-09-02",
      timeSlot: "14:00 - 15:20",
      vehicleType: "auto",
      vehicleModel: "Gol",
      vehicleCount: 1,
      servicePrice: 90000,
      status: "cancelado",
      paymentStatus: "falta_pagar",
      notes: "",
    },
  ];

  it("lista solo falta_pagar no cancelados", () => {
    const open = listOpenDebtsFromAppointments(appointments);
    expect(open).toHaveLength(2);
    expect(open.map((d) => d.code).sort()).toEqual(["A1", "B2"]);
    expect(remainingOf(open[0])).toBe(open[0].amount);
  });

  it("resume abiertas y vencidas", () => {
    const open = listOpenDebtsFromAppointments(appointments);
    const stats = computeAppointmentDebtStats(open);
    expect(stats.openCount).toBe(2);
    expect(stats.overdueCount).toBe(1);
    expect(stats.pendingGs).toBe(210000);
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
