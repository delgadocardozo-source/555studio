import { describe, expect, it } from "vitest";
import { computeLoyaltyStatus, applyFreeWashToVehicles, LOYALTY_WASHES_PER_REWARD } from "../shared/loyalty";
import { mergeGarageVehicles, sanitizeCustomerVehicles } from "../shared/customerGarage";
import {
  selectReengageCandidates,
  daysBetween,
  buildReengageWhatsAppText,
  PUBLIC_BOOKING_URL,
} from "../shared/reengage";

describe("loyalty", () => {
  it("premia cada 5 lavados del mes", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      scheduledDate: `2026-10-${String(i + 1).padStart(2, "0")}`,
      status: "finalizado",
    }));
    const status = computeLoyaltyStatus(rows, { monthKey: "2026-10" });
    expect(LOYALTY_WASHES_PER_REWARD).toBe(5);
    expect(status.washesThisMonth).toBe(5);
    expect(status.rewardsEarned).toBe(1);
    expect(status.eligibleForFreeWash).toBe(true);
  });

  it("resta premios ya usados", () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => ({
        scheduledDate: `2026-10-${String(i + 1).padStart(2, "0")}`,
        status: "finalizado",
      })),
      {
        scheduledDate: "2026-10-10",
        status: "pendiente",
        loyaltyFree: 1,
      },
    ];
    const status = computeLoyaltyStatus(rows, { monthKey: "2026-10" });
    expect(status.rewardsUsed).toBe(1);
    expect(status.freeWashCredits).toBe(0);
    expect(status.eligibleForFreeWash).toBe(false);
  });

  it("aplica gratis al vehículo más caro", () => {
    const { total, applied, vehicles } = applyFreeWashToVehicles([
      { type: "auto" as const, price: 90000 },
      { type: "camioneta" as const, price: 120000 },
    ]);
    expect(applied).toBe(true);
    expect(total).toBe(90000);
    expect(vehicles.find((v) => v.type === "camioneta")?.price).toBe(0);
  });
});

describe("garage", () => {
  it("mergea sin duplicar", () => {
    const a = sanitizeCustomerVehicles([{ type: "auto", model: "Corolla", plate: "ABC123" }]);
    const merged = mergeGarageVehicles(a, [
      { type: "auto", model: "Corolla", plate: "abc123" },
      { type: "camioneta", model: "Hilux", plate: "" },
    ]);
    expect(merged).toHaveLength(2);
  });
});

describe("reengage", () => {
  it("selecciona clientes a ~7 días sin turno futuro", () => {
    const today = "2026-10-15";
    expect(daysBetween("2026-10-08", today)).toBe(7);
    const candidates = selectReengageCandidates({
      today,
      appointments: [
        {
          clientPhone: "0981111222",
          clientName: "Ana",
          scheduledDate: "2026-10-08",
          status: "finalizado",
        },
        {
          clientPhone: "0981333444",
          clientName: "Bob",
          scheduledDate: "2026-10-08",
          status: "finalizado",
        },
        {
          clientPhone: "0981333444",
          clientName: "Bob",
          scheduledDate: "2026-10-20",
          status: "pendiente",
        },
      ],
      customers: [
        { phoneKey: "595981111222", clientName: "Ana", clientPhone: "0981111222" },
        { phoneKey: "595981333444", clientName: "Bob", clientPhone: "0981333444" },
      ],
      normalizePhoneKey: (p) => {
        const d = p.replace(/\D/g, "").replace(/^0/, "");
        return d.startsWith("595") ? d : `595${d}`;
      },
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].clientName).toBe("Ana");
  });

  it("sigue en la lista si ya se le escribió y no reservó", () => {
    const today = "2026-10-15";
    const normalizePhoneKey = (p: string) => {
      const d = p.replace(/\D/g, "").replace(/^0/, "");
      return d.startsWith("595") ? d : `595${d}`;
    };
    const candidates = selectReengageCandidates({
      today,
      appointments: [
        {
          clientPhone: "0981111222",
          clientName: "Ana",
          scheduledDate: "2026-09-20",
          status: "finalizado",
        },
      ],
      customers: [
        {
          phoneKey: "595981111222",
          clientName: "Ana",
          clientPhone: "0981111222",
          lastReminderAt: "2026-10-14T15:00:00.000Z",
        },
      ],
      normalizePhoneKey,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].lastReminderAt).toContain("2026-10-14");
    expect(candidates[0].daysSinceWash).toBeGreaterThan(7);
  });

  it("sale de la lista solo cuando tiene un turno nuevo", () => {
    const today = "2026-10-15";
    const candidates = selectReengageCandidates({
      today,
      appointments: [
        {
          clientPhone: "0981111222",
          clientName: "Ana",
          scheduledDate: "2026-10-01",
          status: "finalizado",
        },
        {
          clientPhone: "0981111222",
          clientName: "Ana",
          scheduledDate: "2026-10-18",
          status: "pendiente",
        },
      ],
      customers: [
        { phoneKey: "595981111222", clientName: "Ana", clientPhone: "0981111222" },
      ],
      normalizePhoneKey: (p) => {
        const d = p.replace(/\D/g, "").replace(/^0/, "");
        return d.startsWith("595") ? d : `595${d}`;
      },
    });
    expect(candidates).toHaveLength(0);
  });

  it("incluye link de reserva online en el mensaje WA", () => {
    const text = buildReengageWhatsAppText({
      clientName: "Soleyl Pérez",
      lastWashDate: "2026-09-28",
    });
    expect(text).toContain("Soleyl");
    expect(text).toContain("2026-09-28");
    expect(text).toContain(PUBLIC_BOOKING_URL);
    expect(text).toContain("reservar online");
  });
});
