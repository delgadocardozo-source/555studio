import { describe, expect, it } from "vitest";
import { buildDayServicesText } from "../client/src/lib/dayServicesListPdf";

describe("hoja para el que lava", () => {
  it("incluye el día de la semana y está dirigida al lavador", () => {
    const text = buildDayServicesText("2026-09-25", [
      {
        status: "confirmado",
        timeSlot: "08:00 - 09:20",
        clientName: "Ana",
        clientPhone: "0981111222",
        vehicleType: "auto",
        vehicleModel: "Corolla",
        cityZone: "Asuncion",
        address: "Palma 100",
        servicePrice: 90000,
        code: "CS-0001",
        vehicleCount: 1,
      },
    ]);
    expect(text).toContain("Para el que lava");
    expect(text).toContain("viernes, 25 de septiembre de 2026");
    expect(text).toContain("Ana");
    expect(text).toContain("Palma 100");
  });
});
