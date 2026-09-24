/** Duración estándar de lavado por vehículo (1h 20min). */
export const MINUTES_PER_VEHICLE = 80;

/** Inicio y fin de jornada operativa. */
export const WORKDAY_START = "08:00";
export const WORKDAY_END = "18:00";

/**
 * Posibles horas de inicio (cada 20 min).
 * El fin se calcula según cantidad de vehículos.
 */
export const START_TIMES: string[] = (() => {
  const starts: string[] = [];
  const dayEnd = timeToMinutes(WORKDAY_END);
  for (let m = timeToMinutes(WORKDAY_START); m + MINUTES_PER_VEHICLE <= dayEnd; m += 20) {
    starts.push(minutesToTime(m));
  }
  return starts;
})();

/**
 * Franjas visuales del calendario (1 vehículo = 1 franja de 1h20).
 * Sirven de guía; un turno multi-vehículo puede ocupar varias.
 */
export const SLOT_BANDS: string[] = (() => {
  const bands: string[] = [];
  const dayEnd = timeToMinutes(WORKDAY_END);
  for (let m = timeToMinutes(WORKDAY_START); m + MINUTES_PER_VEHICLE <= dayEnd; m += MINUTES_PER_VEHICLE) {
    bands.push(`${minutesToTime(m)} - ${minutesToTime(m + MINUTES_PER_VEHICLE)}`);
  }
  return bands;
})();

export function timeToMinutes(time: string): number {
  const [h, m] = time.trim().split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(total: number): string {
  const clamped = Math.max(0, Math.min(total, 24 * 60 - 1));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

export function durationForVehicles(vehicleCount: number): number {
  const count = Math.max(1, Math.floor(vehicleCount) || 1);
  return count * MINUTES_PER_VEHICLE;
}

export function buildTimeSlot(startTime: string, vehicleCount: number): string {
  const start = timeToMinutes(startTime);
  const end = start + durationForVehicles(vehicleCount);
  return `${minutesToTime(start)} - ${minutesToTime(end)}`;
}

export function parseTimeSlot(timeSlot: string): { start: number; end: number } | null {
  if (!timeSlot || typeof timeSlot !== "string") return null;
  const parts = timeSlot.split("-").map((p) => p.trim());
  if (parts.length < 2) return null;
  const start = timeToMinutes(parts[0]);
  const end = timeToMinutes(parts[1]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

export function getSlotStart(timeSlot: string): string {
  const parsed = parseTimeSlot(timeSlot);
  if (!parsed) return timeSlot?.split("-")[0]?.trim() || WORKDAY_START;
  return minutesToTime(parsed.start);
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function timeSlotOverlapsRange(timeSlot: string, rangeStart: number, rangeEnd: number): boolean {
  const parsed = parseTimeSlot(timeSlot);
  if (!parsed) return false;
  return rangesOverlap(parsed.start, parsed.end, rangeStart, rangeEnd);
}

/** True si el inicio del turno cae dentro de la franja (no solo solapa). */
export function appointmentStartsInBand(timeSlot: string, band: string): boolean {
  const parsed = parseTimeSlot(timeSlot);
  const bandRange = parseTimeSlot(band);
  if (!parsed || !bandRange) return false;
  return parsed.start >= bandRange.start && parsed.start < bandRange.end;
}

export function timeSlotsOverlap(a: string, b: string): boolean {
  const pa = parseTimeSlot(a);
  const pb = parseTimeSlot(b);
  if (!pa || !pb) return a === b;
  return rangesOverlap(pa.start, pa.end, pb.start, pb.end);
}

export function fitsInWorkday(startTime: string, vehicleCount: number): boolean {
  const start = timeToMinutes(startTime);
  const end = start + durationForVehicles(vehicleCount);
  return start >= timeToMinutes(WORKDAY_START) && end <= timeToMinutes(WORKDAY_END);
}

export function appointmentVehicleCount(row: {
  vehicleCount?: number | null;
  vehicles?: unknown;
}): number {
  const count = Number(row.vehicleCount);
  if (Number.isFinite(count) && count > 0) return count;
  if (typeof row.vehicles === "string" && row.vehicles.trim()) {
    try {
      const parsed = JSON.parse(row.vehicles);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.length;
    } catch {
      // ignore
    }
  }
  if (Array.isArray(row.vehicles) && row.vehicles.length > 0) return row.vehicles.length;
  return 1;
}

/** Estados que aún requieren lavado (cuentan en “agendados / a lavar”). */
export function isPendingWashStatus(status: string | null | undefined): boolean {
  return status !== "finalizado" && status !== "cancelado";
}
