import { describe, expect, it } from "vitest";
import { planAgendaCashSync, type AgendaCashPlan } from "../shared/agendaCash";
import type { CashMovement } from "../shared/cashLedger";

function row(partial: Partial<CashMovement> & Pick<CashMovement, "id">): CashMovement {
  return {
    type: "ingreso",
    amount: 90000,
    movementDate: "2026-10-07",
    person: "Luz Aguilera",
    category: "Cobro manual",
    description: "",
    createdAt: "2026-10-07T12:00:00.000Z",
    updatedAt: "2026-10-07T12:00:00.000Z",
    ...partial,
  };
}

function paid(extra: Partial<Parameters<typeof planAgendaCashSync>[0]> = {}) {
  return planAgendaCashSync({
    rows: [],
    code: "555-20261007-Luz",
    clientName: "Luz Aguilera",
    amount: 90000,
    paymentStatus: "pagado",
    paymentMethod: "efectivo",
    movementDate: "2026-10-07",
    scheduledDate: "2026-10-07",
    ...extra,
  });
}

describe("cobro de agenda a caja", () => {
  it("crea un ingreso al marcar pagado", () => {
    const plan = paid();
    expect(plan.action).toBe("create");
    if (plan.action !== "create") return;
    expect(plan.input.amount).toBe(90000);
    expect(plan.input.person).toBe("Luz Aguilera");
    expect(plan.input.category).toBe("Cobro agenda");
    expect(plan.input.type).toBe("ingreso");
    expect(plan.input.description).toContain("[AGENDA:555-20261007-Luz]");
    expect(plan.input.description).toContain("efectivo");
  });

  it("anota también el comprobante digital", () => {
    const plan = paid({ paymentMethod: "comprobante_digital" });
    expect(plan.action).toBe("create");
    if (plan.action !== "create") return;
    expect(plan.input.description).toContain("comprobante");
  });

  it("no duplica si el turno ya está en caja", () => {
    const plan = paid({
      rows: [
        row({
          id: 4,
          description: "Cobro agenda 555-20261007-Luz · Luz Aguilera · efectivo [AGENDA:555-20261007-Luz]",
          category: "Cobro agenda",
          movementDate: "2026-10-06",
        }),
      ],
    });
    expect(plan.action).toBe("update");
    if (plan.action !== "update") return;
    expect(plan.id).toBe(4);
    expect(plan.input.movementDate).toBe("2026-10-06");
    expect(plan.deleteIds).toEqual([]);
  });

  it("adopta el ingreso cargado a mano del mismo día y monto", () => {
    const plan = paid({
      rows: [row({ id: 9, description: "pago luz", category: "Cobro manual" })],
    });
    expect(plan.action).toBe("update");
    if (plan.action !== "update") return;
    expect(plan.id).toBe(9);
    expect(plan.input.description).toContain("[AGENDA:555-20261007-Luz]");
  });

  it("saca el ingreso de caja si el turno pasa a falta pagar", () => {
    const plan = paid({
      paymentStatus: "falta_pagar",
      paymentMethod: null,
      rows: [
        row({
          id: 4,
          description: "Cobro [AGENDA:555-20261007-Luz]",
        }),
      ],
    });
    expect(plan).toEqual<AgendaCashPlan>({ action: "delete", ids: [4] });
  });

  it("no anota un lavado en cero", () => {
    expect(paid({ amount: 0 }).action).toBe("noop");
  });
});
