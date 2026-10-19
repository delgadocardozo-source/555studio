import { describe, expect, it } from "vitest";
import { buildOperationalWorkbook } from "../shared/operationalReports";
import { crc32, encodeXlsx } from "../shared/xlsxWorkbook";
import type { ServiceInvoice } from "../shared/invoicing";
import type { CashMovement } from "../shared/cashLedger";
import type { AppointmentDebt } from "../shared/receivables";

function invoice(partial: Partial<ServiceInvoice> & Pick<ServiceInvoice, "number" | "appointmentCode">): ServiceInvoice {
  return {
    id: 1,
    status: "emitida",
    issuedDate: "2026-10-08",
    appointmentId: 1,
    clientName: "Ana",
    clientPhone: "0981111222",
    clientTaxId: "",
    companyName: "",
    lines: [],
    total: 90000,
    taxableBase: 81818,
    ivaAmount: 8182,
    voidReason: "",
    voidedAt: null,
    createdAt: "2026-10-08",
    updatedAt: "2026-10-08",
    ...partial,
  };
}

describe("excel de informes", () => {
  it("calcula el crc32 conocido", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("cruza el turno con la factura, la caja y la deuda por código", () => {
    const cash: CashMovement = {
      id: 1,
      type: "ingreso",
      amount: 90000,
      movementDate: "2026-10-08",
      person: "Ana",
      category: "Cobro agenda",
      description: "Lavado [AGENDA:CS-0001]",
      createdAt: "2026-10-08",
      updatedAt: "2026-10-08",
    };
    const debt: AppointmentDebt = {
      appointmentId: 2,
      code: "CS-0002",
      clientName: "Luz",
      clientPhone: "0981555666",
      scheduledDate: "2026-10-09",
      timeSlot: "09:00 - 10:20",
      vehicleSummary: "auto Hilux",
      serviceStatus: "finalizado",
      amount: 120000,
      amountPaid: 0,
      status: "pendiente",
      paymentStatus: "falta_pagar",
      notes: "",
    };
    const book = buildOperationalWorkbook({
      generatedOn: "2026-10-19",
      appointments: [
        {
          code: "CS-0001",
          scheduledDate: "2026-10-08",
          timeSlot: "08:00 - 09:20",
          clientName: "Ana",
          clientPhone: "0981111222",
          clientType: "particular",
          companyName: "",
          clientTaxId: "",
          cityZone: "Asuncion",
          address: "Palma",
          vehiclesLabel: "auto Corolla",
          servicePrice: 90000,
          status: "finalizado",
          paymentStatus: "pagado",
          paymentMethod: "efectivo",
          source: "interno_manual",
        },
        {
          code: "CS-0002",
          scheduledDate: "2026-10-09",
          timeSlot: "09:00 - 10:20",
          clientName: "Luz",
          clientPhone: "0981555666",
          clientType: "particular",
          companyName: "",
          clientTaxId: "",
          cityZone: "Luque",
          address: "Centro",
          vehiclesLabel: "auto Hilux",
          servicePrice: 120000,
          status: "finalizado",
          paymentStatus: "falta_pagar",
          paymentMethod: "",
          source: "interno_manual",
        },
      ],
      cash: [cash],
      closes: [],
      invoices: [invoice({ number: "CS-000001", appointmentCode: "CS-0001", total: 90000 })],
      debts: [debt],
      customers: [],
      stock: [],
      stockMoves: [],
      staff: [],
      payments: [],
      suppliers: [],
      reengage: [],
      firstContacts: [],
    });

    expect(book.fileName).toBe("555-informes-2026-10-19.xlsx");
    const cruce = book.sheets.find((sheet) => sheet.name === "Cruce");
    expect(cruce?.rows[0]).toContain("Codigo");
    expect(cruce?.rows[1]).toEqual([
      "CS-0002",
      "2026-10-09",
      "Luz",
      "0981555666",
      "Luque",
      "finalizado",
      "falta_pagar",
      "",
      120000,
      "",
      "",
      "",
      0,
      120000,
    ]);
    expect(cruce?.rows[2]?.[0]).toBe("CS-0001");
    expect(cruce?.rows[2]?.[9]).toBe("CS-000001");
    expect(cruce?.rows[2]?.[12]).toBe(90000);
    expect(book.sheets.map((sheet) => sheet.name)).toContain("Caja");
    expect(book.sheets.map((sheet) => sheet.name)).toContain("Primer contacto");

    const bytes = encodeXlsx(book.sheets);
    const xml = new TextDecoder().decode(bytes);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(xml).toContain("CS-000001");
    expect(xml).toContain("[AGENDA:codigo]");
    expect(xml).toContain("name=\"Cruce\"");
  });
});
