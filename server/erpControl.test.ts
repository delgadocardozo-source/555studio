import { describe, expect, it } from "vitest";
import { computeErpControlSnapshot } from "../shared/erpControl";
import { buildCustomerCrmCard, rankCustomerCrmCards } from "../shared/customerCrm";

describe("erp control tower", () => {
  it("alerta cuando caja está por debajo de cobros de agenda", () => {
    const snap = computeErpControlSnapshot({
      agendaCobradoGs: 1_000_000,
      cajaIngresosGs: 400_000,
      cajaEgresosGs: 200_000,
      cajaBalanceGs: 200_000,
      deudaAbiertaGs: 90_000,
      deudaAbiertaCount: 1,
      deudaVencidaCount: 1,
      stockValueGs: 500_000,
      lowStockCount: 2,
      lavadosPeriodo: 10,
      autosLavadosPeriodo: 12,
      recontactoPendiente: 3,
      nominaPagadaGs: 0,
    });
    expect(snap.reconStatus).toBe("caja_menor");
    expect(snap.resultadoGs).toBe(800_000);
    expect(snap.alerts.some((a) => a.id === "deuda")).toBe(true);
    expect(snap.alerts.some((a) => a.id === "stock")).toBe(true);
    expect(snap.alerts.some((a) => a.id.startsWith("recon"))).toBe(true);
  });
});

describe("customer crm", () => {
  it("arma ficha 360 con LTV y deuda", () => {
    const card = buildCustomerCrmCard({
      customer: {
        phoneKey: "595981111222",
        clientName: "Ana",
        clientPhone: "0981111222",
        vehicles: [{ id: "1", type: "auto", model: "Corolla", plate: "ABC" }],
        freeWashCredits: 0,
        lastWashAt: "2026-10-01",
      },
      appointments: [
        {
          clientPhone: "0981111222",
          scheduledDate: "2026-10-01",
          status: "finalizado",
          paymentStatus: "pagado",
          servicePrice: 90000,
        },
        {
          clientPhone: "0981111222",
          scheduledDate: "2026-10-05",
          status: "finalizado",
          paymentStatus: "falta_pagar",
          servicePrice: 90000,
        },
      ],
      openDebts: [
        {
          appointmentId: 2,
          code: "X",
          clientName: "Ana",
          clientPhone: "0981111222",
          scheduledDate: "2026-10-05",
          timeSlot: "",
          vehicleSummary: "auto",
          serviceStatus: "finalizado",
          amount: 90000,
          amountPaid: 0,
          status: "pendiente",
          paymentStatus: "falta_pagar",
          notes: "",
        },
      ],
      normalizePhoneKey: (p) => {
        const d = p.replace(/\D/g, "").replace(/^0/, "");
        return d.startsWith("595") ? d : `595${d}`;
      },
      today: "2026-10-06",
    });
    expect(card.lifetimePaidGs).toBe(90000);
    expect(card.openDebtGs).toBe(90000);
    expect(card.washesTotal).toBe(2);
    expect(card.vehicles).toHaveLength(1);

    const ranked = rankCustomerCrmCards([
      { ...card, phoneKey: "b", openDebtGs: 0, lifetimePaidGs: 100 },
      card,
    ]);
    expect(ranked[0].phoneKey).toBe("595981111222");
  });
});
