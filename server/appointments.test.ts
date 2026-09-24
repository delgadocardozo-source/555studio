import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createMockContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("Appointments tRPC router with Payment Rules", () => {
  it("lists existing appointments and supports filters", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.appointments.list({});
    expect(Array.isArray(result)).toBe(true);
  });

  it("calculates dashboard stats including collected and pending revenues", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const stats = await caller.appointments.stats();
    expect(stats).toHaveProperty("total");
    expect(stats).toHaveProperty("pendientes");
    expect(stats).toHaveProperty("enProceso");
    expect(stats).toHaveProperty("finalizados");
    expect(stats).toHaveProperty("pagados");
    expect(stats).toHaveProperty("faltaPagar");
    expect(stats).toHaveProperty("ingresosCobrados");
    expect(stats).toHaveProperty("montoPendienteCobro");
    expect(stats).toHaveProperty("vehiculosPorLavar");
    expect(stats).toHaveProperty("serviciosActivos");
  });

  it("finalizes an appointment with cash declaration", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const created = await caller.appointments.create({
      clientName: "Cliente Efectivo",
      clientPhone: "0981 111 222",
      clientType: "particular",
      vehicleType: "auto",
      vehicleModel: "Toyota Vitz",
      servicePrice: 90000,
      cityZone: "Luque",
      address: "Centro de Luque",
      scheduledDate: "2026-09-30",
      timeSlot: "11:00 - 12:30",
      source: "interno_manual",
    });

    const finalized = await caller.appointments.finalizeWithPayment({
      id: created.id,
      paymentStatus: "pagado",
      paymentMethod: "efectivo",
    });

    expect(finalized?.status).toBe("finalizado");
    expect(finalized?.paymentStatus).toBe("pagado");
    expect(finalized?.paymentMethod).toBe("efectivo");

    // Cleanup
    await caller.appointments.delete({ id: created.id });
  });

  it("requires receipt url when payment is digital", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const created = await caller.appointments.create({
      clientName: "Cliente Digital",
      clientPhone: "0981 333 444",
      clientType: "particular",
      vehicleType: "camioneta",
      vehicleModel: "Kia Sportage",
      servicePrice: 120000,
      cityZone: "San Lorenzo",
      address: "Avda. Avelino Martínez",
      scheduledDate: "2026-09-30",
      timeSlot: "13:30 - 15:00",
      source: "interno_manual",
    });

    // Sin comprobante debe fallar
    await expect(
      caller.appointments.finalizeWithPayment({
        id: created.id,
        paymentStatus: "pagado",
        paymentMethod: "comprobante_digital",
        paymentReceiptUrl: null,
      })
    ).rejects.toThrow();

    // Con comprobante debe finalizar exitosamente
    const finalized = await caller.appointments.finalizeWithPayment({
      id: created.id,
      paymentStatus: "pagado",
      paymentMethod: "comprobante_digital",
      paymentReceiptUrl: "/manus-storage/receipt_test.png",
      paymentReceiptName: "receipt_test.png",
    });

    expect(finalized?.status).toBe("finalizado");
    expect(finalized?.paymentStatus).toBe("pagado");
    expect(finalized?.paymentMethod).toBe("comprobante_digital");
    expect(finalized?.paymentReceiptUrl).toBe("/manus-storage/receipt_test.png");

    // Cleanup
    await caller.appointments.delete({ id: created.id });
  });

  it("creates an appointment with multiple vehicles and calculates consolidated total", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const multi = await caller.appointments.create({
      clientName: "Cliente con 3 Vehículos",
      clientPhone: "0981 777 888",
      clientType: "particular",
      cityZone: "Asuncion",
      address: "Barrio Herrera",
      scheduledDate: "2026-10-02",
      timeSlot: "08:00 - 09:30",
      source: "interno_manual",
      vehicles: [
        { type: "auto", model: "Kia Rio", plate: "ABC 111" },
        { type: "camioneta", model: "Toyota Hilux", plate: "DEF 222" },
        { type: "auto", model: "Hyundai HB20", plate: "GHI 333" },
      ],
    });

    // 90.000 + 120.000 + 90.000 = 300.000 Gs.
    expect(multi.servicePrice).toBe(300000);
    expect(multi.vehicleCount).toBe(3);
    expect(multi.vehicleModel).toBe("Kia Rio");

    // Cleanup
    await caller.appointments.delete({ id: multi.id });
  });

  it("saves optional RUC, creates client profile and allows autofill for recurring appointments", async () => {
    const ctx = createMockContext();
    const caller = appRouter.createCaller(ctx);

    const recurringPhone = "0981 999 555";

    const created = await caller.appointments.create({
      clientName: "Servicios Corporativos S.A.",
      clientPhone: recurringPhone,
      clientType: "empresa_flota",
      companyName: "Servicios Corporativos",
      clientTaxId: "80012345-6",
      vehicleType: "camioneta",
      vehicleModel: "Toyota Hilux Blanca",
      cityZone: "Asuncion",
      address: "Avda. Mariscal López 1200",
      scheduledDate: "2026-10-05",
      timeSlot: "15:00 - 16:30",
      source: "interno_manual",
    });

    expect(created.clientTaxId).toBe("80012345-6");

    // Verificar que la ficha del cliente existe y puede encontrarse por teléfono o búsqueda
    const profile = await caller.customers.findByPhone({ phone: recurringPhone });
    expect(profile).not.toBeNull();
    expect(profile?.clientName).toBe("Servicios Corporativos S.A.");
    expect(profile?.clientTaxId).toBe("80012345-6");

    const searched = await caller.customers.search({ query: "80012345" });
    expect(searched.some((c) => c.clientTaxId === "80012345-6")).toBe(true);

    // Cleanup
    await caller.appointments.delete({ id: created.id });
  });
});
