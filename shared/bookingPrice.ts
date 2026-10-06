/** Precio interno de agendamientos — historial, pendientes y WhatsApp. */

import { catalogPriceForVehicle } from "./loyalty";

export type BookingVehicleType = "auto" | "camioneta";

export interface BookingVehicleInput {
  type: BookingVehicleType;
  model: string;
  plate?: string | null;
}

export interface HistoryPriceRow {
  status: string;
  servicePrice?: number | null;
  vehicleType?: string | null;
  vehicleModel?: string | null;
  licensePlate?: string | null;
  vehicles?: string | null | Array<{
    type?: string;
    model?: string;
    plate?: string | null;
    price?: number | null;
  }>;
  scheduledDate?: string | null;
}

export interface PricedVehicle extends BookingVehicleInput {
  price: number;
  fromHistory: boolean;
}

export interface ResolvedBookingPrice {
  vehicles: PricedVehicle[];
  total: number;
  /** True si TODOS los vehículos resolvieron precio desde historial (mismo vehículo). */
  fromHistory: boolean;
  /** True si al menos un vehículo usó historial. */
  anyFromHistory: boolean;
}

export function normalizePlate(plate: string | null | undefined): string {
  return String(plate || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function normalizeModel(model: string | null | undefined): string {
  return String(model || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isPricePending(row: {
  pricePending?: number | boolean | null;
  servicePrice?: number | null;
  source?: string | null;
}): boolean {
  if (row.pricePending === true || row.pricePending === 1) return true;
  // Compat: portal sin flag y total 0 = pendiente de definir
  if (
    (row.pricePending == null || row.pricePending === 0) &&
    row.source === "portal_cliente" &&
    Number(row.servicePrice || 0) === 0
  ) {
    return true;
  }
  return false;
}

function parseHistoryVehicles(row: HistoryPriceRow): Array<{
  type: BookingVehicleType;
  model: string;
  plate: string;
  price: number;
}> {
  const out: Array<{ type: BookingVehicleType; model: string; plate: string; price: number }> = [];
  let raw = row.vehicles;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }
  if (Array.isArray(raw) && raw.length > 0) {
    for (const v of raw) {
      const model = String(v?.model || "").trim();
      if (!model) continue;
      const price = Number(v?.price);
      if (!Number.isFinite(price) || price < 0) continue;
      out.push({
        type: v?.type === "camioneta" ? "camioneta" : "auto",
        model,
        plate: String(v?.plate || ""),
        price,
      });
    }
  }
  if (out.length === 0 && row.vehicleModel) {
    const price = Number(row.servicePrice);
    if (Number.isFinite(price) && price >= 0) {
      out.push({
        type: row.vehicleType === "camioneta" ? "camioneta" : "auto",
        model: String(row.vehicleModel),
        plate: String(row.licensePlate || ""),
        price,
      });
    }
  }
  return out;
}

/** ¿Mismo vehículo? Prioriza chapa; si no hay, tipo + modelo. */
export function vehiclesMatch(
  a: { type: string; model: string; plate?: string | null },
  b: { type: string; model: string; plate?: string | null }
): boolean {
  const plateA = normalizePlate(a.plate);
  const plateB = normalizePlate(b.plate);
  if (plateA && plateB) return plateA === plateB;
  const typeA = a.type === "camioneta" ? "camioneta" : "auto";
  const typeB = b.type === "camioneta" ? "camioneta" : "auto";
  if (typeA !== typeB) return false;
  const modelA = normalizeModel(a.model);
  const modelB = normalizeModel(b.model);
  return Boolean(modelA) && modelA === modelB;
}

/**
 * Busca el precio más reciente de un vehículo en turnos finalizados.
 * Si hay varios vehículos en un turno histórico y coinciden varios, usa el price del ítem.
 */
export function findHistoricalPriceForVehicle(
  vehicle: BookingVehicleInput,
  history: HistoryPriceRow[]
): number | null {
  const finalized = history
    .filter((r) => r.status === "finalizado")
    .slice()
    .sort((a, b) => String(b.scheduledDate || "").localeCompare(String(a.scheduledDate || "")));

  for (const row of finalized) {
    const items = parseHistoryVehicles(row);
    const match = items.find((item) => vehiclesMatch(vehicle, item));
    if (match && match.price > 0) return match.price;
    // Turno de un solo vehículo: si coincide el principal y no había price por ítem útil
    if (
      items.length === 1 &&
      vehiclesMatch(vehicle, items[0]) &&
      Number(row.servicePrice) > 0
    ) {
      return Number(row.servicePrice);
    }
  }
  return null;
}

/**
 * Resuelve precios para una reserva:
 * - Con historial del mismo vehículo → precio previo
 * - Sin historial → catálogo (sugerido interno)
 * `fromHistory` solo es true si TODOS los vehículos vinieron del historial.
 */
export function resolveBookingPrice(params: {
  vehicles: BookingVehicleInput[];
  history: HistoryPriceRow[];
  /** Si true, exige historial para todos; si alguno falla, fromHistory=false y usa catálogo. */
  requireAllHistory?: boolean;
}): ResolvedBookingPrice {
  const requireAll = params.requireAllHistory !== false;
  const priced: PricedVehicle[] = params.vehicles.map((v) => {
    const type: BookingVehicleType = v.type === "camioneta" ? "camioneta" : "auto";
    const hist = findHistoricalPriceForVehicle(
      { type, model: v.model, plate: v.plate },
      params.history
    );
    if (hist != null && hist > 0) {
      return {
        type,
        model: String(v.model || "").trim(),
        plate: v.plate ?? null,
        price: hist,
        fromHistory: true,
      };
    }
    return {
      type,
      model: String(v.model || "").trim(),
      plate: v.plate ?? null,
      price: catalogPriceForVehicle(type),
      fromHistory: false,
    };
  });

  const anyFromHistory = priced.some((v) => v.fromHistory);
  const allFromHistory = priced.length > 0 && priced.every((v) => v.fromHistory);
  const fromHistory = requireAll ? allFromHistory : anyFromHistory;

  // Si pedimos historial completo y falló alguno, devolvemos catálogo en todos
  // pero marcamos fromHistory=false (staff debe definir). Los precios de ítems
  // ya tienen hist o catálogo; eso sirve como sugerencia interna.
  return {
    vehicles: priced,
    total: priced.reduce((s, v) => s + v.price, 0),
    fromHistory: allFromHistory,
    anyFromHistory,
  };
}

export function formatGs(amount: number): string {
  return `${Number(amount || 0).toLocaleString("es-PY")} Gs.`;
}

export function buildWhatsAppPhone(phone: string): string {
  const digits = String(phone || "").replace(/\D/g, "").replace(/^0/, "");
  if (!digits) return "";
  return digits.startsWith("595") ? digits : `595${digits}`;
}

/** Texto de confirmación al cliente (incluye precio ya definido por staff). */
export function buildClientWhatsAppConfirmation(params: {
  clientName: string;
  clientPhone?: string;
  scheduledDate: string;
  timeSlot: string;
  vehicleLabel: string;
  servicePrice: number;
  code?: string | null;
  cityZone?: string | null;
}): string {
  const first = String(params.clientName || "").trim().split(/\s+/)[0] || "hola";
  const lines = [
    `¡Hola ${first}! Somos *555 Detail Studio*.`,
    "",
    "Confirmamos tu lavado a domicilio:",
    params.code ? `· Código: ${params.code}` : null,
    `· Fecha: ${params.scheduledDate}`,
    `· Horario: ${params.timeSlot}`,
    params.cityZone ? `· Zona: ${params.cityZone}` : null,
    `· ${params.vehicleLabel}`,
    `· Total: *${formatGs(params.servicePrice)}*`,
    "",
    "¡Gracias por elegirnos!",
  ];
  return lines.filter((l) => l !== null).join("\n");
}

export function buildWhatsAppConfirmationUrl(params: {
  clientPhone: string;
  text: string;
}): string {
  const phone = buildWhatsAppPhone(params.clientPhone);
  if (!phone) return "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(params.text)}`;
}
