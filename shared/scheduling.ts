/** Duración estándar de lavado por vehículo (1h 20min). */
export const MINUTES_PER_VEHICLE = 80;

/** Grilla de inicios permitidos (permite 15:15 / 15:20 / 15:30, etc.). */
export const START_INTERVAL_MINUTES = 5;

/** Inicio y fin de jornada operativa. */
export const WORKDAY_START = "07:30";
export const WORKDAY_END = "18:00";

/**
 * Posibles horas de inicio (cada 5 min dentro de la jornada).
 * El fin se calcula según cantidad de vehículos (N × 80 min).
 */
export const START_TIMES: string[] = (() => {
  const starts: string[] = [];
  const dayEnd = timeToMinutes(WORKDAY_END);
  for (
    let m = timeToMinutes(WORKDAY_START);
    m + MINUTES_PER_VEHICLE <= dayEnd;
    m += START_INTERVAL_MINUTES
  ) {
    starts.push(minutesToTime(m));
  }
  return starts;
})();

/**
 * @deprecated Las franjas fijas ya no se usan en la UI.
 * Se mantiene solo por compatibilidad con datos viejos / imports residuales.
 */
export const SLOT_BANDS: string[] = (() => {
  const bands: string[] = [];
  const dayEnd = timeToMinutes(WORKDAY_END);
  for (
    let m = timeToMinutes(WORKDAY_START);
    m + MINUTES_PER_VEHICLE <= dayEnd;
    m += MINUTES_PER_VEHICLE
  ) {
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

/** True si el inicio del turno cae dentro de la franja (legacy). */
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

export type OccupiedRange = { start: number; end: number };

/** Fusiona rangos solapados/contiguos para calcular huecos reales. */
export function mergeOccupiedRanges(ranges: OccupiedRange[]): OccupiedRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: OccupiedRange[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const last = merged[merged.length - 1];
    if (cur.start <= last.end) {
      last.end = Math.max(last.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

/**
 * Huecos libres en la jornada (por horario real, no por franja).
 * Ej: turno 13:30–15:00 → hueco libre desde 15:00 (permite agendar 15:15 / 15:20…).
 */
export function computeFreeGaps(
  occupied: OccupiedRange[],
  dayStart: string = WORKDAY_START,
  dayEnd: string = WORKDAY_END
): OccupiedRange[] {
  const startM = timeToMinutes(dayStart);
  const endM = timeToMinutes(dayEnd);
  const merged = mergeOccupiedRanges(
    occupied.filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
  );
  const gaps: OccupiedRange[] = [];
  let cursor = startM;
  for (const block of merged) {
    const blockStart = Math.max(block.start, startM);
    const blockEnd = Math.min(block.end, endM);
    if (blockStart > cursor) gaps.push({ start: cursor, end: blockStart });
    cursor = Math.max(cursor, blockEnd);
  }
  if (cursor < endM) gaps.push({ start: cursor, end: endM });
  return gaps;
}

/** Cuántos lavados de `vehicleCount` autos caben en un hueco (sin solaparse entre sí). */
export function washesThatFitInGap(gap: OccupiedRange, vehicleCount: number = 1): number {
  const duration = durationForVehicles(vehicleCount);
  if (duration <= 0) return 0;
  return Math.floor((gap.end - gap.start) / duration);
}

/**
 * Inicios disponibles para N vehículos dados los turnos ya ocupados.
 * Usa solape real: si el anterior termina a las 15:00, 15:00 / 15:05 / 15:15 quedan libres.
 */
export function availableStartTimes(
  vehicleCount: number,
  occupiedSlots: string[],
  options?: { excludeSlot?: string }
): string[] {
  const duration = durationForVehicles(vehicleCount);
  const occupied = occupiedSlots
    .filter((s) => s && s !== options?.excludeSlot)
    .map((s) => parseTimeSlot(s))
    .filter((r): r is OccupiedRange => r != null);

  return START_TIMES.filter((start) => {
    if (!fitsInWorkday(start, vehicleCount)) return false;
    const aStart = timeToMinutes(start);
    const aEnd = aStart + duration;
    return !occupied.some((b) => rangesOverlap(aStart, aEnd, b.start, b.end));
  });
}

/** Ajusta un texto de hora/franja a la grilla de inicios más cercana hacia abajo. */
export function snapStartToGrid(startTime: string): string {
  const minutes = timeToMinutes(getSlotStart(startTime));
  const dayStart = timeToMinutes(WORKDAY_START);
  const snapped =
    dayStart +
    Math.floor(Math.max(0, minutes - dayStart) / START_INTERVAL_MINUTES) * START_INTERVAL_MINUTES;
  return minutesToTime(snapped);
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
