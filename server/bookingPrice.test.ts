import { describe, expect, it } from "vitest";
import {
  buildClientWhatsAppConfirmation,
  buildWhatsAppConfirmationUrl,
  findHistoricalPriceForVehicle,
  isPricePending,
  resolveBookingPrice,
  vehiclesMatch,
} from "../shared/bookingPrice";

describe("bookingPrice — matching e historial", () => {
  it("matches by plate ignoring spaces/case", () => {
    expect(
      vehiclesMatch(
        { type: "auto", model: "Vitz", plate: "abc 123" },
        { type: "camioneta", model: "Otro", plate: "ABC123" }
      )
    ).toBe(true);
  });

  it("matches by type+model when plates missing", () => {
    expect(
      vehiclesMatch(
        { type: "camioneta", model: "Toyota Hilux", plate: "" },
        { type: "camioneta", model: "toyota  hilux", plate: null }
      )
    ).toBe(true);
    expect(
      vehiclesMatch(
        { type: "auto", model: "Toyota Hilux", plate: "" },
        { type: "camioneta", model: "Toyota Hilux", plate: "" }
      )
    ).toBe(false);
  });

  it("suggests historical price for same vehicle", () => {
    const history = [
      {
        status: "finalizado",
        scheduledDate: "2026-09-01",
        servicePrice: 95000,
        vehicleType: "auto",
        vehicleModel: "Kia Rio",
        licensePlate: "ABC 111",
        vehicles: JSON.stringify([
          { type: "auto", model: "Kia Rio", plate: "ABC 111", price: 95000 },
        ]),
      },
      {
        status: "finalizado",
        scheduledDate: "2026-08-01",
        servicePrice: 90000,
        vehicleType: "auto",
        vehicleModel: "Kia Rio",
        licensePlate: "ABC 111",
      },
    ];

    expect(
      findHistoricalPriceForVehicle(
        { type: "auto", model: "Kia Rio", plate: "ABC111" },
        history
      )
    ).toBe(95000);
  });

  it("resolveBookingPrice marks fromHistory only when all vehicles match", () => {
    const history = [
      {
        status: "finalizado",
        scheduledDate: "2026-09-10",
        servicePrice: 110000,
        vehicles: JSON.stringify([
          { type: "camioneta", model: "Hilux", plate: "XYZ 9", price: 110000 },
        ]),
      },
    ];

    const all = resolveBookingPrice({
      vehicles: [{ type: "camioneta", model: "Hilux", plate: "XYZ9" }],
      history,
    });
    expect(all.fromHistory).toBe(true);
    expect(all.total).toBe(110000);

    const partial = resolveBookingPrice({
      vehicles: [
        { type: "camioneta", model: "Hilux", plate: "XYZ9" },
        { type: "auto", model: "Nuevo", plate: "" },
      ],
      history,
    });
    expect(partial.fromHistory).toBe(false);
    expect(partial.anyFromHistory).toBe(true);
    expect(partial.total).toBe(110000 + 90000);
  });

  it("falls back to catalog when no history", () => {
    const resolved = resolveBookingPrice({
      vehicles: [
        { type: "auto", model: "Vitz", plate: "" },
        { type: "camioneta", model: "SW4", plate: "" },
      ],
      history: [],
    });
    expect(resolved.fromHistory).toBe(false);
    expect(resolved.total).toBe(210000);
  });

  it("isPricePending detects flag and portal zero", () => {
    expect(isPricePending({ pricePending: 1, servicePrice: 90000 })).toBe(true);
    expect(isPricePending({ pricePending: 0, servicePrice: 90000 })).toBe(false);
    expect(
      isPricePending({ pricePending: 0, servicePrice: 0, source: "portal_cliente" })
    ).toBe(true);
  });
});

describe("bookingPrice — WhatsApp confirmación", () => {
  it("builds confirmation text including price", () => {
    const text = buildClientWhatsAppConfirmation({
      clientName: "María López",
      scheduledDate: "2026-10-10",
      timeSlot: "09:00 - 10:20",
      vehicleLabel: "1 vehículo",
      servicePrice: 90000,
      code: "555-20261010-1234",
      cityZone: "Luque",
    });
    expect(text).toContain("María");
    expect(text).toContain("90.000 Gs.");
    expect(text).toContain("555-20261010-1234");
    expect(text).toContain("Luque");
  });

  it("builds wa.me url with encoded text", () => {
    const url = buildWhatsAppConfirmationUrl({
      clientPhone: "0981 111 222",
      text: "Hola\nTotal: 90.000 Gs.",
    });
    expect(url.startsWith("https://wa.me/595981111222?text=")).toBe(true);
    expect(url).toContain(encodeURIComponent("Hola\nTotal: 90.000 Gs."));
  });
});
