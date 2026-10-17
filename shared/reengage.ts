/** Recontacto a 7 días post-lavado — cola operativa + WhatsApp. */

export const REENGAGE_DAYS_AFTER_WASH = 7;

/** Portal público de reserva (cliente). */
export const PUBLIC_BOOKING_URL = "https://555-detail-agenda.vercel.app/agendar";

export interface ReengageCandidate {
  phoneKey: string;
  clientName: string;
  clientPhone: string;
  lastWashDate: string;
  daysSinceWash: number;
  lastReminderAt: string | null;
  hasUpcoming: boolean;
}

export function daysBetween(fromIsoDate: string, toIsoDate: string): number {
  const a = Date.parse(`${fromIsoDate}T12:00:00`);
  const b = Date.parse(`${toIsoDate}T12:00:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

export function buildReengageWhatsAppText(params: {
  clientName: string;
  lastWashDate: string;
  bookingUrl?: string;
}): string {
  const first = String(params.clientName || "").trim().split(/\s+/)[0] || "hola";
  const url = String(params.bookingUrl || PUBLIC_BOOKING_URL).trim();
  return (
    `¡Hola ${first}! Somos *555 Detail Studio*.\n\n` +
    `Hace una semana limpiamos tu vehículo (${params.lastWashDate}).\n` +
    `¿Querés agendar de nuevo? Podés responder este mensaje o reservar online:\n` +
    `${url}\n\n` +
    `¡Te esperamos!`
  );
}

export interface FirstContactCandidate {
  phoneKey: string;
  clientName: string;
  clientPhone: string;
  lastReminderAt: string | null;
}

/** Invitación al primer lavado. No menciona un lavado anterior. */
export function buildFirstContactWhatsAppText(params: {
  clientName: string;
  bookingUrl?: string;
}): string {
  const first = String(params.clientName || "").trim().split(/\s+/)[0] || "hola";
  const url = String(params.bookingUrl || PUBLIC_BOOKING_URL).trim();
  return (
    `¡Hola ${first}! Somos *555 Detail Studio*.\n\n` +
    `Queremos invitarte a tu primer lavado.\n` +
    `Podés responder este mensaje o reservar online:\n` +
    `${url}\n\n` +
    `¡Te esperamos!`
  );
}

export function whatsAppChatUrl(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.startsWith("595") ? digits : `595${digits.replace(/^0/, "")}`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(text)}`;
}

/**
 * Clientes con último lavado finalizado hace al menos `days`,
 * sin turno futuro pendiente.
 * Escribirles por WhatsApp no los saca: salen solo cuando reservan.
 */
export function selectReengageCandidates(params: {
  today: string;
  days?: number;
  appointments: Array<{
    clientPhone: string;
    clientName: string;
    scheduledDate: string;
    status: string;
  }>;
  customers: Array<{
    phoneKey: string;
    clientName: string;
    clientPhone: string;
    lastReminderAt?: string | null;
  }>;
  normalizePhoneKey: (phone: string) => string;
  /** Tope opcional de días después del umbral. Sin tope, quedan hasta que reserven. */
  windowDays?: number;
}): ReengageCandidate[] {
  const days = params.days ?? REENGAGE_DAYS_AFTER_WASH;
  const windowDays = params.windowDays;
  const byPhone = new Map<
    string,
    { name: string; phone: string; lastWash: string; hasUpcoming: boolean }
  >();

  for (const ap of params.appointments) {
    const key = params.normalizePhoneKey(ap.clientPhone);
    if (!key) continue;
    const cur = byPhone.get(key) || {
      name: ap.clientName,
      phone: ap.clientPhone,
      lastWash: "",
      hasUpcoming: false,
    };
    if (ap.status === "finalizado") {
      if (!cur.lastWash || ap.scheduledDate > cur.lastWash) {
        cur.lastWash = ap.scheduledDate;
        cur.name = ap.clientName || cur.name;
        cur.phone = ap.clientPhone || cur.phone;
      }
    }
    if (
      ap.status !== "finalizado" &&
      ap.status !== "cancelado" &&
      ap.scheduledDate >= params.today
    ) {
      cur.hasUpcoming = true;
    }
    byPhone.set(key, cur);
  }

  const customerByKey = new Map(params.customers.map((c) => [c.phoneKey, c]));
  const out: ReengageCandidate[] = [];

  for (const [phoneKey, info] of Array.from(byPhone.entries())) {
    if (!info.lastWash || info.hasUpcoming) continue;
    const since = daysBetween(info.lastWash, params.today);
    if (since < days) continue;
    if (windowDays != null && since > days + windowDays) continue;
    const cust = customerByKey.get(phoneKey);
    const lastReminderAt = cust?.lastReminderAt ? String(cust.lastReminderAt) : null;
    out.push({
      phoneKey,
      clientName: cust?.clientName || info.name,
      clientPhone: cust?.clientPhone || info.phone,
      lastWashDate: info.lastWash,
      daysSinceWash: since,
      lastReminderAt,
      hasUpcoming: false,
    });
  }

  return out.sort((a, b) => b.daysSinceWash - a.daysSinceWash);
}

/**
 * Clientes que todavía no tienen un lavado finalizado
 * y no tienen un turno próximo (pendiente o en curso).
 * Escribirles no los saca: salen solo cuando reservan o cuando lavan.
 */
export function selectFirstContactCandidates(params: {
  today: string;
  appointments: Array<{
    clientPhone: string;
    scheduledDate: string;
    status: string;
  }>;
  customers: Array<{
    phoneKey: string;
    clientName: string;
    clientPhone: string;
    lastReminderAt?: string | null;
  }>;
  normalizePhoneKey: (phone: string) => string;
}): FirstContactCandidate[] {
  const washed = new Set<string>();
  const upcoming = new Set<string>();

  for (const ap of params.appointments) {
    const key = params.normalizePhoneKey(ap.clientPhone);
    if (!key) continue;
    if (ap.status === "finalizado") washed.add(key);
    if (
      ap.status !== "finalizado" &&
      ap.status !== "cancelado" &&
      ap.scheduledDate >= params.today
    ) {
      upcoming.add(key);
    }
  }

  const out: FirstContactCandidate[] = [];
  for (const cust of params.customers) {
    const phoneKey = params.normalizePhoneKey(cust.phoneKey || cust.clientPhone);
    if (!phoneKey || washed.has(phoneKey) || upcoming.has(phoneKey)) continue;
    const name = String(cust.clientName || "").trim();
    const phone = String(cust.clientPhone || "").trim();
    if (!name || !phone) continue;
    out.push({
      phoneKey,
      clientName: name,
      clientPhone: phone,
      lastReminderAt: cust.lastReminderAt ? String(cust.lastReminderAt) : null,
    });
  }

  return out.sort((a, b) => a.clientName.localeCompare(b.clientName, "es"));
}
