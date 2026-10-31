import { describe, expect, it } from "vitest";
import { groupWasherOrders, mapsUrlFor, toWasherStops, washerRouteUrl } from "../shared/washerRoute";
import { decodeWashPhoto } from "./washerPhoto";
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
        scheduledDate: "2026-10-30",
        servicePrice: 180000,
        paymentStatus: "pagado",
        clientTaxId: "80012345-6",
        paymentReceiptUrl: "https://example.com/recibo.jpg",
        vehicles: [{ type: "camioneta", model: "Hilux", plate: "XYZ", price: 180000 }],
        washPhotoUrl: "https://example.com/hilux.jpg",
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
    expect(stops[0].scheduledDate).toBe("2026-10-30");
    expect(stops[0].washPhotoUrl).toBe("https://example.com/hilux.jpg");
    expect(stops[0].vehicles[0]).not.toHaveProperty("price");
    const packed = JSON.stringify(stops);
    expect(packed).not.toContain("180000");
    expect(packed).not.toContain("pagado");
    expect(packed).not.toContain("80012345");
    expect(packed).not.toContain("recibo.jpg");
    expect(packed).not.toContain("Ana");
  });

  it("ordena hoy, después lo que viene y al final lo anterior", () => {
    const groups = groupWasherOrders(
      [
        { scheduledDate: "2026-10-29", code: "ayer", timeSlot: "", status: "", clientName: "", clientPhone: "", companyName: "", vehicles: [], cityZone: "", address: "", addressReference: "", locationUrl: "", mapsUrl: "", notes: "", washPhotoUrl: "" },
        { scheduledDate: "2026-10-31", code: "manana", timeSlot: "", status: "", clientName: "", clientPhone: "", companyName: "", vehicles: [], cityZone: "", address: "", addressReference: "", locationUrl: "", mapsUrl: "", notes: "", washPhotoUrl: "" },
        { scheduledDate: "2026-10-30", code: "hoy", timeSlot: "", status: "", clientName: "", clientPhone: "", companyName: "", vehicles: [], cityZone: "", address: "", addressReference: "", locationUrl: "", mapsUrl: "", notes: "", washPhotoUrl: "" },
      ],
      "2026-10-30"
    );
    expect(groups.map((group) => group.date)).toEqual(["2026-10-30", "2026-10-31", "2026-10-29"]);
  });

  it("rechaza una foto que no es imagen", () => {
    expect(() => decodeWashPhoto({ fileName: "nota.txt", contentType: "text/plain", base64Data: "aG9sYQ==" })).toThrow(
      /imagen/
    );
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
