/** Órdenes de trabajo para el colaborador. Sin montos. */

import { appointmentVehicleCount, normalizeTimeSlot, parseTimeSlot } from "./scheduling";

export interface WasherVehicle {
  type: string;
  model: string;
  plate: string;
}

export interface WasherStop {
  code: string;
  scheduledDate: string;
  timeSlot: string;
  status: string;
  clientName: string;
  clientPhone: string;
  companyName: string;
  vehicles: WasherVehicle[];
  cityZone: string;
  address: string;
  addressReference: string;
  locationUrl: string;
  mapsUrl: string;
  notes: string;
  washPhotoUrl: string;
}

export function washerRouteUrl(origin: string, token: string, date?: string): string {
  const base = String(origin || "").replace(/\/+$/, "");
  const url = new URL(`${base}/lavar/${encodeURIComponent(token)}`);
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) url.searchParams.set("fecha", date);
  return url.toString();
}

export function mapsUrlFor(params: {
  locationUrl?: string | null;
  address?: string | null;
  cityZone?: string | null;
}): string {
  const direct = String(params.locationUrl || "").trim();
  if (/^https?:\/\//i.test(direct)) return direct;
  const query = [params.address, params.cityZone, "Paraguay"].map((part) => String(part || "").trim()).filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || "Asuncion, Paraguay")}`;
}

function vehiclesOf(row: any): WasherVehicle[] {
  if (row?.vehicles) {
    try {
      const parsed = typeof row.vehicles === "string" ? JSON.parse(row.vehicles) : row.vehicles;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((vehicle) => ({
          type: vehicle?.type === "camioneta" ? "camioneta" : "auto",
          model: String(vehicle?.model || "Vehículo").trim(),
          plate: String(vehicle?.plate || "").trim(),
        }));
      }
    } catch {
      /* un vehículo simple */
    }
  }
  return [
    {
      type: row?.vehicleType === "camioneta" ? "camioneta" : "auto",
      model: String(row?.vehicleModel || "Vehículo").trim(),
      plate: String(row?.licensePlate || "").trim(),
    },
  ];
}

function publicPhotoUrl(value: unknown): string {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}

/** Arma la orden que ve el colaborador. El precio, el cobro y el RUC no salen de esta función. */
export function toWasherStops(rows: any[]): WasherStop[] {
  return [...(rows || [])]
    .filter((row) => row && row.status !== "cancelado")
    .map((row) => {
      const count = appointmentVehicleCount(row);
      const locationUrl = String(row.locationUrl || "").trim();
      const address = String(row.address || "").trim();
      const cityZone = String(row.cityZone || "").trim();
      return {
        code: String(row.code || ""),
        scheduledDate: String(row.scheduledDate || "").trim(),
        timeSlot: normalizeTimeSlot(String(row.timeSlot || ""), count),
        status: String(row.status || ""),
        clientName: String(row.clientName || "").trim(),
        clientPhone: String(row.clientPhone || "").trim(),
        companyName: String(row.companyName || "").trim(),
        vehicles: vehiclesOf(row),
        cityZone,
        address,
        addressReference: String(row.addressReference || "").trim(),
        locationUrl,
        mapsUrl: mapsUrlFor({ locationUrl, address, cityZone }),
        notes: String(row.notes || "").trim(),
        washPhotoUrl: publicPhotoUrl(row.washPhotoUrl),
      };
    })
    .sort((a, b) => {
      const byDate = a.scheduledDate.localeCompare(b.scheduledDate);
      if (byDate !== 0) return byDate;
      const aStart = parseTimeSlot(a.timeSlot)?.start ?? 0;
      const bStart = parseTimeSlot(b.timeSlot)?.start ?? 0;
      return aStart - bStart;
    });
}

/** Hoy primero, después los días que vienen y al final los anteriores. */
export function groupWasherOrders(stops: WasherStop[], today: string): { date: string; orders: WasherStop[] }[] {
  const groups = new Map<string, WasherStop[]>();
  for (const order of stops) {
    const key = /^\d{4}-\d{2}-\d{2}$/.test(order.scheduledDate) ? order.scheduledDate : "sin-fecha";
    const list = groups.get(key) || [];
    list.push(order);
    groups.set(key, list);
  }
  const rank = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 3;
    if (date === today) return 0;
    if (date > today) return 1;
    return 2;
  };
  return Array.from(groups.keys())
    .sort((a, b) => {
      const bucket = rank(a) - rank(b);
      if (bucket !== 0) return bucket;
      return rank(a) === 2 ? b.localeCompare(a) : a.localeCompare(b);
    })
    .map((date) => ({ date, orders: groups.get(date) || [] }));
}
