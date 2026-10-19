/** Arma el Excel operativo con el detalle de cada módulo del ERP. */
import { asuncionDate } from "../shared/agendaCash";
import {
  buildCustomerCrmCard,
  rankCustomerCrmCards,
} from "../shared/customerCrm";
import {
  buildOperationalWorkbook,
  vehiclesLabelFrom,
  type ReportAppointment,
} from "../shared/operationalReports";
import { encodeXlsx } from "../shared/xlsxWorkbook";
import * as agendaDb from "./db";
import * as cashDb from "./cashLedgerDb";
import * as cashCloseDb from "./cashCloseDb";
import * as inventoryDb from "./inventoryDb";
import * as invoicingDb from "./invoicingDb";
import * as payrollDb from "./payrollDb";
import * as receivablesDb from "./receivablesDb";
import * as suppliersDb from "./suppliersDb";

export async function buildOperationalExcel(): Promise<{ fileName: string; base64: string }> {
  const [appointments, cash, closes, invoices, debts, customers, stock, stockMoves, staff, payments, suppliers, reengage, firstContacts] =
    await Promise.all([
      agendaDb.listAppointments({}),
      cashDb.listCashMovements({}),
      cashCloseDb.listCashDayCloses(),
      invoicingDb.listInvoices(),
      receivablesDb.listOpenDebts(),
      agendaDb.listAllCustomers(),
      inventoryDb.listInventoryItems({ includeInactive: true }),
      inventoryDb.listStockMovements(5000),
      payrollDb.listStaff({ includeInactive: true }),
      payrollDb.listPayments({}),
      suppliersDb.listSuppliers({ includeInactive: true }),
      agendaDb.listReengageCandidates(),
      agendaDb.listFirstContactCandidates(),
    ]);

  const cards = rankCustomerCrmCards(
    customers.map((customer) =>
      buildCustomerCrmCard({
        customer: {
          phoneKey: customer.phoneKey,
          clientName: customer.clientName,
          clientPhone: customer.clientPhone,
          clientType: customer.clientType,
          companyName: customer.companyName,
          clientTaxId: customer.clientTaxId,
          vehicles: customer.vehicles || [],
          cityZone: customer.cityZone == null ? null : String(customer.cityZone),
          address: customer.address == null ? null : String(customer.address),
          addressReference: customer.addressReference == null ? null : String(customer.addressReference),
          locationUrl: customer.locationUrl == null ? null : String(customer.locationUrl),
          freeWashCredits: customer.freeWashCredits,
          lastWashAt: customer.lastWashAt,
          lastReminderAt: customer.lastReminderAt,
        },
        appointments: appointments.map((row) => ({
          clientPhone: row.clientPhone,
          clientName: row.clientName,
          scheduledDate: row.scheduledDate,
          status: row.status,
          paymentStatus: row.paymentStatus,
          servicePrice: row.servicePrice,
          cityZone: row.cityZone,
          address: row.address,
          addressReference: row.addressReference,
          locationUrl: row.locationUrl,
        })),
        openDebts: debts,
        normalizePhoneKey: agendaDb.normalizePhoneKey,
      })
    )
  );

  const turnos: ReportAppointment[] = appointments.map((row) => ({
    code: String(row.code || ""),
    scheduledDate: String(row.scheduledDate || ""),
    timeSlot: String(row.timeSlot || ""),
    clientName: String(row.clientName || ""),
    clientPhone: String(row.clientPhone || ""),
    clientType: String(row.clientType || ""),
    companyName: String(row.companyName || ""),
    clientTaxId: String(row.clientTaxId || ""),
    cityZone: String(row.cityZone || ""),
    address: String(row.address || ""),
    vehiclesLabel: vehiclesLabelFrom(row),
    servicePrice: Math.round(Number(row.servicePrice) || 0),
    status: String(row.status || ""),
    paymentStatus: String(row.paymentStatus || ""),
    paymentMethod: String(row.paymentMethod || ""),
    source: String(row.source || ""),
  }));

  const book = buildOperationalWorkbook({
    generatedOn: asuncionDate(),
    appointments: turnos,
    cash,
    closes,
    invoices,
    debts,
    customers: cards,
    stock,
    stockMoves,
    staff,
    payments,
    suppliers,
    reengage,
    firstContacts,
  });
  const bytes = encodeXlsx(book.sheets);
  return {
    fileName: book.fileName,
    base64: Buffer.from(bytes).toString("base64"),
  };
}
