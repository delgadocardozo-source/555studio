import { describe, expect, it } from "vitest";
import { computePayrollStats, matchPaymentFilters, type StaffMember, type StaffPayment } from "../shared/payroll";

const staff: StaffMember[] = [
  {
    id: 1,
    name: "Seba",
    role: "Lavador",
    payType: "quincenal",
    baseAmount: 1500000,
    active: true,
    notes: "",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: 2,
    name: "Marce",
    role: "Lavador",
    payType: "semanal",
    baseAmount: 800000,
    active: true,
    notes: "",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
];

const payments: StaffPayment[] = [
  {
    id: 1,
    staffId: 1,
    staffName: "Seba",
    amount: 1500000,
    paymentDate: "2026-09-15",
    concept: "Quincena",
    notes: "",
    createdAt: "2026-09-15T12:00:00.000Z",
    updatedAt: "2026-09-15T12:00:00.000Z",
  },
  {
    id: 2,
    staffId: 1,
    staffName: "Seba",
    amount: 200000,
    paymentDate: "2026-09-20",
    concept: "Adelanto",
    notes: "",
    createdAt: "2026-09-20T12:00:00.000Z",
    updatedAt: "2026-09-20T12:00:00.000Z",
  },
  {
    id: 3,
    staffId: 2,
    staffName: "Marce",
    amount: 800000,
    paymentDate: "2026-09-22",
    concept: "Semana",
    notes: "",
    createdAt: "2026-09-22T12:00:00.000Z",
    updatedAt: "2026-09-22T12:00:00.000Z",
  },
];

describe("payroll stats", () => {
  it("suma pagos por persona", () => {
    const stats = computePayrollStats(staff, payments);
    expect(stats.staffActive).toBe(2);
    expect(stats.paymentsCount).toBe(3);
    expect(stats.totalPaid).toBe(2500000);
    const seba = stats.byStaff.find((s) => s.staffName === "Seba");
    expect(seba?.totalPaid).toBe(1700000);
    expect(seba?.payments).toBe(2);
    expect(seba?.lastPaymentDate).toBe("2026-09-20");
  });

  it("filtra pagos por fecha y persona", () => {
    expect(matchPaymentFilters(payments[0], { dateFrom: "2026-09-16" })).toBe(false);
    expect(matchPaymentFilters(payments[1], { staffId: 1, dateFrom: "2026-09-16" })).toBe(true);
    expect(matchPaymentFilters(payments[2], { staffId: 1 })).toBe(false);
  });
});
