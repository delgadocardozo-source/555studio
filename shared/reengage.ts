/** Recontacto a 7 días post-lavado — cola operativa + WhatsApp. */

export const REENGAGE_DAYS_AFTER_WASH = 7;

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
}): string {
  const first = String(params.clientName || "").trim().split(/\s+/)[0] || "hola";
  return (
    `¡Hola ${first}! 👋 Somos *555 Detail Studio*.\n\n` +
    `Hace una semana limpiamos tu vehículo (${params.lastWashDate}).\n` +
    `¿Querés agendar de nuevo? Podés responder este mensaje o entrar a reservar online.\n\n` +
    `¡Te esperamos! ✨`
  );
}

/**
 * Clientes con último lavado finalizado hace exactamente `days` (o ≥ days si loose),
 * sin turno futuro pendiente, y sin reminder reciente.
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
  /** Si true, incluye ≥ days (útil para cola diaria). Default: ≥ days y ≤ days+2. */
  windowDays?: number;
}): ReengageCandidate[] {
  const days = params.days ?? REENGAGE_DAYS_AFTER_WASH;
  const windowDays = params.windowDays ?? 2;
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
    if (since < days || since > days + windowDays) continue;
    const cust = customerByKey.get(phoneKey);
    const lastReminderAt = cust?.lastReminderAt ? String(cust.lastReminderAt) : null;
    if (lastReminderAt) {
      const reminderDay = lastReminderAt.slice(0, 10);
      // No re-avisar si ya se marcó reminder después del último lavado.
      if (reminderDay >= info.lastWash) continue;
    }
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
