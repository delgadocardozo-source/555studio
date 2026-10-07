import { describe, expect, it } from "vitest";
import {
  activeInvoiceForAppointment,
  buildInvoiceDraft,
  computeInvoiceStats,
  formatInvoiceNumber,
  nextInvoiceNumber,
  splitIvaIncluded,
  type ServiceInvoice,
} from "../shared/invoicing";

const wash = {
  id: 12,
  code: "A-12",
  status: "finalizado",
  paymentStatus: "falta_pagar",
  clientName: "Ale Gómez",
  clientPhone: "0981111222",
  clientTaxId: "80012345-6",
  companyName: "",
  servicePrice: 90000,
  scheduledDate: "2026-10-01",
  vehicleType: "auto",
  vehicleModel: "Corolla",
  licensePlate: "ABC123",
  vehicles: JSON.stringify([{ type: "auto", model: "Corolla", plate: "ABC123", price: 90000 }]),
};

describe("facturación", () => {
  it("desglosa IVA 10% incluido y cierra con el total", () => {
    const tax = splitIvaIncluded(90000);
    expect(tax.total).toBe(90000);
    expect(tax.taxableBase + tax.ivaAmount).toBe(90000);
    expect(tax.ivaAmount).toBe(Math.round((90000 * 10) / 110));
  });

  it("numera en secuencia y no recicla anulados", () => {
    expect(formatInvoiceNumber(1)).toBe("CS-000001");
    expect(nextInvoiceNumber([])).toBe("CS-000001");
    expect(nextInvoiceNumber(["CS-000001", "CS-000004"])).toBe("CS-000005");
  });

  it("emite un solo comprobante vigente por turno finalizado", () => {
    const draft = buildInvoiceDraft(wash, [], "2026-10-07");
    expect(draft.total).toBe(90000);
    expect(draft.clientTaxId).toBe("80012345-6");
    expect(draft.lines[0].description).toContain("Corolla");
    expect(activeInvoiceForAppointment([{ appointmentId: 12, status: "emitida" }], 12)).toBe(true);
    expect(() =>
      buildInvoiceDraft(wash, [{ appointmentId: 12, status: "emitida" }], "2026-10-07")
    ).toThrow(/vigente/);
    const afterVoid = buildInvoiceDraft(wash, [{ appointmentId: 12, status: "anulada" }], "2026-10-07");
    expect(afterVoid.appointmentId).toBe(12);
  });

  it("rechaza turnos sin finalizar, cancelados o en cero", () => {
    expect(() => buildInvoiceDraft({ ...wash, status: "pendiente" }, [], "2026-10-07")).toThrow(
      /finalizado/
    );
    expect(() => buildInvoiceDraft({ ...wash, status: "cancelado" }, [], "2026-10-07")).toThrow(
      /cancelado/
    );
    expect(() => buildInvoiceDraft({ ...wash, servicePrice: 0, vehicles: "[]" }, [], "2026-10-07")).toThrow(
      /monto/
    );
  });

  it("el pendiente de cobro sale del turno, no de un segundo libro", () => {
    const invoice = {
      id: 1,
      number: "CS-000001",
      status: "emitida",
      issuedDate: "2026-10-07",
      appointmentId: 12,
      appointmentCode: "A-12",
      clientName: "Ale",
      clientPhone: "0981",
      clientTaxId: "",
      companyName: "",
      lines: [],
      total: 90000,
      taxableBase: 81818,
      ivaAmount: 8182,
      voidReason: "",
      voidedAt: null,
      createdAt: "",
      updatedAt: "",
    } satisfies ServiceInvoice;
    const open = computeInvoiceStats([invoice], new Map([[12, "falta_pagar"]]));
    expect(open.pendingCollectionGs).toBe(90000);
    expect(open.pendingCount).toBe(1);
    const paid = computeInvoiceStats([invoice], new Map([[12, "pagado"]]));
    expect(paid.pendingCollectionGs).toBe(0);
    expect(paid.issuedTotalGs).toBe(90000);
  });
});
