import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { cashDifference, summarizeCashDay } from "../shared/cashClose";
import { hashPin, pinMatches, signStaffToken, staffTokenValid } from "./staffAccess";

function ctx(): TrpcContext {
  return {
    user: null,
    req: { headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
      setHeader: () => {},
    } as unknown as TrpcContext["res"],
  };
}

describe("cierre de caja del día", () => {
  it("deja el comprobante fuera del cajón y resta los egresos", () => {
    const summary = summarizeCashDay(
      [
        { type: "ingreso", amount: 90000, movementDate: "2026-10-07", description: "Cobro agenda · efectivo [AGENDA:A]" },
        { type: "ingreso", amount: 120000, movementDate: "2026-10-07", description: "Cobro agenda · comprobante [AGENDA:B]" },
        { type: "egreso", amount: 30000, movementDate: "2026-10-07", description: "shampoo" },
        { type: "ingreso", amount: 50000, movementDate: "2026-10-08", description: "otro día" },
      ],
      "2026-10-07"
    );
    expect(summary.efectivoIn).toBe(90000);
    expect(summary.comprobanteIn).toBe(120000);
    expect(summary.egresos).toBe(30000);
    expect(summary.expectedDrawer).toBe(60000);
    expect(cashDifference(summary.expectedDrawer, 60000)).toBe(0);
    expect(cashDifference(summary.expectedDrawer, 50000)).toBe(-10000);
  });
});

describe("clave del equipo", () => {
  it("acepta la clave correcta y rechaza otra", () => {
    const hashed = hashPin("2468");
    expect(pinMatches("2468", hashed.salt, hashed.hash)).toBe(true);
    expect(pinMatches("2469", hashed.salt, hashed.hash)).toBe(false);
    const token = signStaffToken(hashed.hash);
    expect(staffTokenValid(token, hashed.hash)).toBe(true);
    expect(staffTokenValid(token, hashPin("1111").hash)).toBe(false);
  });

  it("la agenda interna pide clave y el portal de horarios no", async () => {
    const previous = process.env.STAFF_GATE;
    process.env.STAFF_GATE = "on";
    try {
      const caller = appRouter.createCaller(ctx());
      await expect(caller.appointments.list({})).rejects.toThrow(/Clave del equipo/);
      const slots = await caller.appointments.availability({ date: "2026-10-07", vehicleCount: 1 });
      expect(slots.date).toBe("2026-10-07");
      expect(Array.isArray(slots.starts)).toBe(true);
    } finally {
      process.env.STAFF_GATE = previous;
    }
  });
});
