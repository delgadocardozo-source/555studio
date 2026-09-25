import { describe, expect, it } from "vitest";
import { computeManagerialStats } from "../shared/managerialStats";

describe("computeManagerialStats", () => {
  const rows = [
    {
      scheduledDate: "2026-09-24",
      status: "confirmado",
      paymentStatus: "sin_definir",
      servicePrice: 180000,
      vehicleCount: 2,
      cityZone: "Asuncion",
    },
    {
      scheduledDate: "2026-09-24",
      status: "finalizado",
      paymentStatus: "pagado",
      servicePrice: 120000,
      vehicleCount: 1,
      cityZone: "Luque",
    },
    {
      scheduledDate: "2026-09-25",
      status: "finalizado",
      paymentStatus: "falta_pagar",
      servicePrice: 90000,
      vehicleCount: 1,
      cityZone: "Asuncion",
    },
    {
      scheduledDate: "2026-09-20",
      status: "cancelado",
      paymentStatus: "sin_definir",
      servicePrice: 90000,
      vehicleCount: 1,
      cityZone: "Asuncion",
    },
  ];

  it("cuenta autos agendados, lavados, cobrados y pendientes", () => {
    const s = computeManagerialStats(rows);
    expect(s.autosAgendados).toBe(4); // 2+1+1, cancelado excluido
    expect(s.autosLavados).toBe(2);
    expect(s.autosPorLavar).toBe(2);
    expect(s.autosCobrados).toBe(1);
    expect(s.autosFaltaCobrar).toBe(1);
    expect(s.montoCobradoGs).toBe(120000);
    expect(s.montoFaltaCobrarGs).toBe(90000);
    expect(s.montoEnCursoGs).toBe(180000);
    expect(s.serviciosCancelados).toBe(1);
  });

  it("filtra por rango de fechas", () => {
    const s = computeManagerialStats(rows, {
      dateFrom: "2026-09-25",
      dateTo: "2026-09-25",
    });
    expect(s.autosAgendados).toBe(1);
    expect(s.autosFaltaCobrar).toBe(1);
    expect(s.montoCobradoGs).toBe(0);
  });

  it("agrupa por zona", () => {
    const s = computeManagerialStats(rows);
    const asu = s.byZone.find((z) => z.zone === "Asuncion");
    expect(asu?.autos).toBe(3);
    expect(asu?.pendienteGs).toBe(90000);
  });
});
