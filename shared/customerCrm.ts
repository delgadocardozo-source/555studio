/** CRM lite — ficha 360 del cliente para el ERP. */

import { computeLoyaltyStatus, type LoyaltyStatus, type LoyaltyWashRow } from "./loyalty";
import { remainingOf, type AppointmentDebt } from "./receivables";
import type { CustomerVehicle } from "./customerGarage";

export interface CustomerCrmCard {
  phoneKey: string;
  clientName: string;
  clientPhone: string;
  clientType: string;
  companyName: string;
  clientTaxId: string;
  vehicles: CustomerVehicle[];
  cityZone: string;
  address: string;
  addressReference: string;
  locationUrl: string;
  freeWashCredits: number;
  lastWashAt: string | null;
  lastReminderAt: string | null;
  loyalty: LoyaltyStatus;
  /** Lavados finalizados (histórico visible) */
  washesTotal: number;
  washesThisMonth: number;
  /** Monto cobrado histórico (pagado) */
  lifetimePaidGs: number;
  /** Deuda abierta actual */
  openDebtGs: number;
  openDebtCount: number;
  upcomingCount: number;
}

export interface CustomerCrmSource {
  phoneKey: string;
  clientName: string;
  clientPhone: string;
  clientType?: string | null;
  companyName?: string | null;
  clientTaxId?: string | null;
  vehicles?: CustomerVehicle[];
  cityZone?: string | null;
  address?: string | null;
  addressReference?: string | null;
  locationUrl?: string | null;
  freeWashCredits?: number;
  lastWashAt?: string | null;
  lastReminderAt?: string | null;
}

export interface CustomerCrmAppointment {
  clientPhone: string;
  clientName?: string;
  scheduledDate: string;
  status: string;
  paymentStatus?: string | null;
  servicePrice?: number | null;
  cityZone?: string | null;
  address?: string | null;
  addressReference?: string | null;
  locationUrl?: string | null;
}

export function resolveClientLocation(params: {
  profile?: {
    cityZone?: string | null;
    address?: string | null;
    addressReference?: string | null;
    locationUrl?: string | null;
  };
  appointments: Array<{
    scheduledDate: string;
    status: string;
    cityZone?: string | null;
    address?: string | null;
    addressReference?: string | null;
    locationUrl?: string | null;
  }>;
}): { cityZone: string; address: string; addressReference: string; locationUrl: string } {
  const profileAddress = String(params.profile?.address || "").trim();
  if (profileAddress) {
    return {
      cityZone: String(params.profile?.cityZone || "").trim(),
      address: profileAddress,
      addressReference: String(params.profile?.addressReference || "").trim(),
      locationUrl: String(params.profile?.locationUrl || "").trim(),
    };
  }
  const latest = [...params.appointments]
    .filter((row) => row.status !== "cancelado" && String(row.address || "").trim())
    .sort((a, b) => String(b.scheduledDate).localeCompare(String(a.scheduledDate)))[0];
  return {
    cityZone: String(latest?.cityZone || "").trim(),
    address: String(latest?.address || "").trim(),
    addressReference: String(latest?.addressReference || "").trim(),
    locationUrl: String(latest?.locationUrl || "").trim(),
  };
}

export function buildCustomerCrmCard(params: {
  customer: CustomerCrmSource;
  appointments: CustomerCrmAppointment[];
  openDebts: AppointmentDebt[];
  normalizePhoneKey: (phone: string) => string;
  today?: string;
}): CustomerCrmCard {
  const key = params.customer.phoneKey;
  const mine = params.appointments.filter(
    (a) => params.normalizePhoneKey(a.clientPhone) === key
  );
  const loyaltyRows: LoyaltyWashRow[] = mine.map((a) => ({
    scheduledDate: a.scheduledDate,
    status: a.status,
    paymentStatus: a.paymentStatus,
    servicePrice: a.servicePrice,
    notes: null,
  }));
  const loyalty = computeLoyaltyStatus(loyaltyRows, {
    storedCredits: Number(params.customer.freeWashCredits) || 0,
  });

  const finalized = mine.filter((a) => a.status === "finalizado");
  const lifetimePaidGs = finalized
    .filter((a) => a.paymentStatus === "pagado")
    .reduce((s, a) => s + (Number(a.servicePrice) || 0), 0);

  const today = params.today || new Date().toISOString().slice(0, 10);
  const upcomingCount = mine.filter(
    (a) =>
      a.status !== "finalizado" &&
      a.status !== "cancelado" &&
      a.scheduledDate >= today
  ).length;

  const debts = params.openDebts.filter(
    (d) => params.normalizePhoneKey(d.clientPhone) === key
  );
  const openDebtGs = debts.reduce((s, d) => s + remainingOf(d), 0);
  const location = resolveClientLocation({ profile: params.customer, appointments: mine });

  return {
    phoneKey: key,
    clientName: params.customer.clientName,
    clientPhone: params.customer.clientPhone,
    clientType: String(params.customer.clientType || "particular"),
    companyName: String(params.customer.companyName || ""),
    clientTaxId: String(params.customer.clientTaxId || ""),
    vehicles: params.customer.vehicles || [],
    cityZone: location.cityZone,
    address: location.address,
    addressReference: location.addressReference,
    locationUrl: location.locationUrl,
    freeWashCredits: Number(params.customer.freeWashCredits) || 0,
    lastWashAt: params.customer.lastWashAt || null,
    lastReminderAt: params.customer.lastReminderAt || null,
    loyalty,
    washesTotal: finalized.length,
    washesThisMonth: loyalty.washesThisMonth,
    lifetimePaidGs,
    openDebtGs,
    openDebtCount: debts.length,
    upcomingCount,
  };
}

export function rankCustomerCrmCards(cards: CustomerCrmCard[]): CustomerCrmCard[] {
  return [...cards].sort((a, b) => {
    if (b.openDebtGs !== a.openDebtGs) return b.openDebtGs - a.openDebtGs;
    if (b.lifetimePaidGs !== a.lifetimePaidGs) return b.lifetimePaidGs - a.lifetimePaidGs;
    return a.clientName.localeCompare(b.clientName);
  });
}
