import { describe, expect, it } from "vitest";
import { mapsUrlFor, toWasherStops, washerRouteUrl } from "../shared/washerRoute";
import { washerTokensMatch } from "./washerLinkDb";

describe("ruta del lavador", () => {
  it("arma el link exclusivo del día", () => {
    expect(washerRouteUrl("https://555-detail-agenda.vercel.app/", "abc", "2026-10-30")).toBe(
      "https://555-detail-agenda.vercel.app/lavar/abc?fecha=2026-10-30"
    );
  });

  it("muestra cliente, vehículo y mapa, y no el precio", () => {
    const stops = toWasherStops([
      {
        code: "CS-0002",
        status: "confirmado",
        timeSlot: "10:00 - 11:20",
        clientName: "Luz",
        clientPhone: "0981555666",
        companyName: "",
        vehicleType: "camioneta",
        vehicleModel: "Hilux",
        licensePlate: "XYZ",
        cityZone: "Luque",
        address: "Ruta 1",
        addressReference: "portón verde",
        locationUrl: "",
        notes: "llegar por atrás",
        servicePrice: 180000,
        paymentStatus: "pagado",
        vehicleCount: 1,
      },
      {
        code: "CS-0001",
        status: "cancelado",
        timeSlot: "08:00 - 09:20",
        clientName: "Ana",
        servicePrice: 90000,
        vehicleCount: 1,
      },
    ]);
    expect(stops).toHaveLength(1);
    expect(stops[0].clientName).toBe("Luz");
    expect(stops[0].vehicles[0]).toEqual({ type: "camioneta", model: "Hilux", plate: "XYZ" });
    expect(stops[0].addressReference).toBe("portón verde");
    expect(stops[0].mapsUrl).toContain("Ruta%201");
    expect(JSON.stringify(stops)).not.toContain("180000");
    expect(JSON.stringify(stops)).not.toContain("pagado");
    expect(JSON.stringify(stops)).not.toContain("Ana");
  });

  it("usa el pin de Maps cuando el cliente lo pasó", () => {
    expect(
      mapsUrlFor({ locationUrl: "https://maps.google.com/?q=palma", address: "Palma", cityZone: "Asuncion" })
    ).toBe("https://maps.google.com/?q=palma");
  });

  it("el token tiene que coincidir completo", () => {
    expect(washerTokensMatch("abcdefghij123456", "abcdefghij123456")).toBe(true);
    expect(washerTokensMatch("abcdefghij123456", "abcdefghij123457")).toBe(false);
    expect(washerTokensMatch("abcdefghij123456", "corta")).toBe(false);
  });
});
