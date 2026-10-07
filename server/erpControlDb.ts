/**
 * Centro de control + CRM — agrega módulos ERP existentes.
 */
import { computeErpControlSnapshot, type ErpControlSnapshot } from "../shared/erpControl";
import {
  buildCustomerCrmCard,
  rankCustomerCrmCards,
  type CustomerCrmCard,
} from "../shared/customerCrm";
import * as agendaDb from "./db";
import * as cashDb from "./cashLedgerDb";
import * as inventoryDb from "./inventoryDb";
import * as payrollDb from "./payrollDb";
import * as receivablesDb from "./receivablesDb";

export async function getErpControlTower(params?: {
  dateFrom?: string;
  dateTo?: string;
}): Promise<ErpControlSnapshot> {
  const dateFrom = params?.dateFrom;
  const dateTo = params?.dateTo;
  const periodLabel =
    dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : dateFrom ? `Desde ${dateFrom}` : "Todo";

  const [managerial, cashStats, debtStats, invStats, payStats, reengage] = await Promise.all([
    agendaDb.getManagerialDashboard({ dateFrom, dateTo }),
    cashDb.getCashLedgerStats({ dateFrom, dateTo }),
    receivablesDb.getDebtStats(),
    inventoryDb.getInventoryStats(),
    payrollDb.getPayrollStats({ dateFrom, dateTo }),
    agendaDb.listReengageCandidates(),
  ]);

  return computeErpControlSnapshot(
    {
      agendaCobradoGs: managerial.montoCobradoGs || 0,
      cajaIngresosGs: cashStats.totalIngresos || 0,
      cajaEgresosGs: cashStats.totalEgresos || 0,
      cajaBalanceGs: cashStats.balance || 0,
      deudaAbiertaGs: debtStats.pendingGs || 0,
      deudaAbiertaCount: debtStats.openCount || 0,
      deudaVencidaCount: debtStats.overdueCount || 0,
      stockValueGs: invStats.stockValueGs || 0,
      lowStockCount: invStats.lowStockCount || 0,
      lavadosPeriodo: managerial.serviciosLavados || 0,
      autosLavadosPeriodo: managerial.autosLavados || 0,
      recontactoPendiente: reengage.length,
      nominaPagadaGs: payStats.totalPaid || 0,
    },
    { periodLabel, dateFrom, dateTo }
  );
}

export async function listCustomerCrm(params?: {
  query?: string;
  limit?: number;
}): Promise<CustomerCrmCard[]> {
  const limit = params?.limit ?? 40;
  const [customers, appointments, openDebts] = await Promise.all([
    agendaDb.searchCustomers(params?.query || "", params?.limit ?? 80),
    agendaDb.listAppointments({}),
    receivablesDb.listOpenDebts(),
  ]);

  const cards = customers.map((c: any) =>
    buildCustomerCrmCard({
      customer: {
        phoneKey: c.phoneKey,
        clientName: c.clientName,
        clientPhone: c.clientPhone,
        clientType: c.clientType,
        companyName: c.companyName,
        clientTaxId: c.clientTaxId,
        vehicles: c.vehicles || [],
        freeWashCredits: c.freeWashCredits,
        lastWashAt: c.lastWashAt,
        lastReminderAt: c.lastReminderAt,
      },
      appointments: appointments.map((a) => ({
        clientPhone: a.clientPhone,
        clientName: a.clientName,
        scheduledDate: a.scheduledDate,
        status: a.status,
        paymentStatus: a.paymentStatus,
        servicePrice: a.servicePrice,
      })),
      openDebts,
      normalizePhoneKey: agendaDb.normalizePhoneKey,
    })
  );

  return rankCustomerCrmCards(cards).slice(0, limit);
}
