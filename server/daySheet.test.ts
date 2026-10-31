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
        addressReference: "portón verde",
        companyName: "Taller Sur",
        servicePrice: 90000,
        code: "CS-0001",
        vehicleCount: 1,
      },
    ]);
    expect(text).toContain("Para el que lava");
    expect(text).toContain("viernes, 25 de septiembre de 2026");
    expect(text).toContain("Ana");
    expect(text).toContain("Palma 100");
    expect(text).toContain("portón verde");
    expect(text).toContain("Taller Sur");
    expect(text).not.toContain("90000");
    expect(text).not.toContain("Gs");
  });

  it("incluye el link exclusivo y sigue sin precio", () => {
    const text = buildDayServicesText(
      "2026-09-25",
      [{ status: "pendiente", timeSlot: "08:00 - 09:20", clientName: "Ana", servicePrice: 150000, vehicleCount: 1 }],
      "https://555-detail-agenda.vercel.app/lavar/secreto?fecha=2026-09-25"
    );
    expect(text).toContain("https://555-detail-agenda.vercel.app/lavar/secreto?fecha=2026-09-25");
    expect(text).not.toContain("150000");
  });
});
