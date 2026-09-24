/** Duración estándar de lavado por vehículo (1h 20min). */
export const MINUTES_PER_VEHICLE = 80;

/** Grilla de inicios permitidos (permite 15:15 / 15:20 / 15:30, etc.). */
export const START_INTERVAL_MINUTES = 5;

/**
 * Jornada de toma de trabajos.
 * - WORKDAY_START: primer inicio posible
 * - WORKDAY_LAST_START / WORKDAY_END: último inicio posible (18:00)
 *   El lavado PUEDE terminar después de las 18:00.
 */
export const WORKDAY_START = "07:30";
export const WORKDAY_LAST_START = "18:00";
/** @deprecated Preferí WORKDAY_LAST_START. Semántica: último inicio, no fin de lavado. */
export const WORKDAY_END = WORKDAY_LAST_START;

/**
 * Posibles horas de inicio (cada 5 min).
 * Se aceptan trabajos hasta las 18:00 inclusive; el fin puede ser después.
 */
export const START_TIMES: string[] = (() => {
  const starts: string[] = [];
  const lastStart = timeToMinutes(WORKDAY_LAST_START);
  for (let m = timeToMinutes(WORKDAY_START); m <= lastStart; m += START_INTERVAL_MINUTES) {
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
  const lastStart = timeToMinutes(WORKDAY_LAST_START);
  for (
    let m = timeToMinutes(WORKDAY_START);
    m <= lastStart;
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

/**
 * ¿Se puede AGARRAR el trabajo a esta hora?
 * Las 18:00 son el último inicio; el lavado puede terminar después.
 */
export function fitsInWorkday(startTime: string, _vehicleCount: number = 1): boolean {
  const start = timeToMinutes(startTime);
  return start >= timeToMinutes(WORKDAY_START) && start <= timeToMinutes(WORKDAY_LAST_START);
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
 * Huecos donde aún se puede AGARRAR un trabajo (hasta WORKDAY_LAST_START inclusive).
 * El extremo derecho del día se extiende un tick para permitir inicio exactamente a las 18:00
 * aunque el turno anterior termine a las 18:00.
 */
export function computeFreeGaps(
  occupied: OccupiedRange[],
  dayStart: string = WORKDAY_START,
  dayEnd: string = WORKDAY_LAST_START
): OccupiedRange[] {
  const startM = timeToMinutes(dayStart);
  const lastStart = timeToMinutes(dayEnd);
  // Extremo exclusivo: permite un hueco puntual en el último inicio
  const endExclusive = lastStart + START_INTERVAL_MINUTES;
  const merged = mergeOccupiedRanges(
    occupied.filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
  );
  const gaps: OccupiedRange[] = [];
  let cursor = startM;
  for (const block of merged) {
    const blockStart = Math.max(block.start, startM);
    const blockEnd = Math.min(block.end, endExclusive);
    if (blockStart > cursor) gaps.push({ start: cursor, end: blockStart });
    cursor = Math.max(cursor, blockEnd);
  }
  if (cursor < endExclusive) gaps.push({ start: cursor, end: endExclusive });
  return gaps;
}

/** Cuántos lavados de `vehicleCount` autos caben empezando dentro del hueco (hasta último inicio). */
export function washesThatFitInGap(gap: OccupiedRange, vehicleCount: number = 1): number {
  const duration = durationForVehicles(vehicleCount);
  if (duration <= 0) return 0;
  const lastStart = timeToMinutes(WORKDAY_LAST_START);
  let count = 0;
  let cursor = gap.start;
  while (cursor < gap.end && cursor <= lastStart) {
    const end = cursor + duration;
    const touchesClosing = gap.end > lastStart || gap.end >= lastStart;
    const okMidDay = end <= gap.end;
    const okLate = touchesClosing && cursor <= lastStart;
    if (!okMidDay && !okLate) break;
    // Si hay un siguiente bloque (gap.end < closing zone), debe terminar antes
    if (gap.end <= lastStart && end > gap.end) break;
    count += 1;
    cursor = end;
  }
  return count;
}

/**
 * Primer inicio de la grilla válido en el hueco.
 * Entre turnos: debe terminar antes del siguiente.
 * Al final del día: puede empezar hasta las 18:00 y terminar después.
 */
export function earliestStartInGap(gap: OccupiedRange, vehicleCount: number = 1): string | null {
  const duration = durationForVehicles(vehicleCount);
  if (duration <= 0) return null;

  const dayStart = timeToMinutes(WORKDAY_START);
  const lastStart = timeToMinutes(WORKDAY_LAST_START);

  let start = Math.max(gap.start, dayStart);
  const offset = start - dayStart;
  const rem = offset % START_INTERVAL_MINUTES;
  if (rem !== 0) start += START_INTERVAL_MINUTES - rem;

  if (start > lastStart || start >= gap.end) return null;

  const finishesBeforeNext = start + duration <= gap.end;
  // Hueco que llega al cierre de toma (o lo pasa por el tick extra)
  const reachesClosing = gap.end > lastStart;
  const canStartLate = reachesClosing && start <= lastStart;

  if (finishesBeforeNext || canStartLate) {
    return minutesToTime(start);
  }
  return null;
}

export function gapFitsVehicles(gap: OccupiedRange, vehicleCount: number): boolean {
  return earliestStartInGap(gap, vehicleCount) != null;
}

/**
 * Inicios disponibles para N vehículos dados los turnos ya ocupados.
 * Usa solape real; permite empezar a las 18:00 aunque el lavado termine después.
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
  return minutesToTime(Math.min(snapped, timeToMinutes(WORKDAY_LAST_START)));
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

/**
 * Recalcula fin del turno: inicio + N×80 min.
 * Corrige datos viejos guardados con franjas fijas de 90 min.
 */
export function normalizeTimeSlot(timeSlot: string, vehicleCount: number): string {
  return buildTimeSlot(getSlotStart(timeSlot), vehicleCount);
}

/** Aplica duración real (1h20 por vehículo) al timeSlot de un turno. */
export function withNormalizedTimeSlot<T extends { timeSlot?: string | null; vehicleCount?: number | null; vehicles?: unknown }>(
  row: T
): T {
  const cars = appointmentVehicleCount(row);
  const slot = String(row.timeSlot || "");
  if (!slot) return { ...row, vehicleCount: cars };
  return {
    ...row,
    vehicleCount: cars,
    timeSlot: normalizeTimeSlot(slot, cars),
  };
}

/** Estados que aún requieren lavado (cuentan en “agendados / a lavar”). */
export function isPendingWashStatus(status: string | null | undefined): boolean {
  return status !== "finalizado" && status !== "cancelado";
}

/** Turno mínimo para algoritmos de empaque / empuje. */
export type ScheduleItem = {
  id: number;
  timeSlot: string;
  vehicleCount: number;
  clientName?: string;
  status?: string | null;
};

export type ScheduleShift = {
  id: number;
  clientName: string;
  fromSlot: string;
  toSlot: string;
  start: string;
};

export type MovePlan = {
  start: string;
  slot: string;
  /** Turnos que hay que correr hacia adelante para liberar el hueco. */
  pushes: ScheduleShift[];
  /** True si el inicio cabe sin tocar a nadie. */
  direct: boolean;
};

function activeScheduleItems(items: ScheduleItem[]): ScheduleItem[] {
  return items.filter((item) => item.status !== "cancelado");
}

/**
 * Empaca turnos en orden cronológico: si dos se solapan, el que empieza después
 * (o el de mayor id a igualdad) se corre al primer inicio libre.
 * Conserva el orden relativo por hora de inicio original.
 */
export function packDaySchedule(items: ScheduleItem[]): ScheduleShift[] {
  const active = activeScheduleItems(items)
    .map((item) => {
      const cars = Math.max(1, Math.floor(item.vehicleCount) || 1);
      const slot = normalizeTimeSlot(item.timeSlot, cars);
      const parsed = parseTimeSlot(slot);
      return {
        id: item.id,
        clientName: item.clientName || `Turno #${item.id}`,
        cars,
        fromSlot: slot,
        desiredStart: parsed?.start ?? timeToMinutes(WORKDAY_START),
      };
    })
    .sort((a, b) => a.desiredStart - b.desiredStart || a.id - b.id);

  const shifts: ScheduleShift[] = [];
  let cursor = timeToMinutes(WORKDAY_START);
  const lastStart = timeToMinutes(WORKDAY_LAST_START);

  for (const item of active) {
    let start = snapMinutesToStartGrid(Math.max(item.desiredStart, cursor));
    if (start > lastStart) continue;

    const toSlot = buildTimeSlot(minutesToTime(start), item.cars);
    if (toSlot !== item.fromSlot) {
      shifts.push({
        id: item.id,
        clientName: item.clientName,
        fromSlot: item.fromSlot,
        toSlot,
        start: minutesToTime(start),
      });
    }
    cursor = start + durationForVehicles(item.cars);
  }

  return shifts;
}

/** Pares que se solapan el mismo día (datos inconsistentes). */
export function findOverlappingPairs(
  items: ScheduleItem[]
): Array<{ a: ScheduleItem; b: ScheduleItem }> {
  const active = activeScheduleItems(items).map((item) => ({
    ...item,
    timeSlot: normalizeTimeSlot(item.timeSlot, item.vehicleCount),
  }));
  const pairs: Array<{ a: ScheduleItem; b: ScheduleItem }> = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (timeSlotsOverlap(active[i].timeSlot, active[j].timeSlot)) {
        pairs.push({ a: active[i], b: active[j] });
      }
    }
  }
  return pairs;
}

function snapMinutesToStartGrid(minutes: number): number {
  const dayStart = timeToMinutes(WORKDAY_START);
  const lastStart = timeToMinutes(WORKDAY_LAST_START);
  let start = Math.max(minutes, dayStart);
  const rem = (start - dayStart) % START_INTERVAL_MINUTES;
  if (rem !== 0) start += START_INTERVAL_MINUTES - rem;
  return Math.min(start, lastStart + START_INTERVAL_MINUTES); // puede quedar > lastStart → inválido
}

/**
 * Planifica mover `movingId` a `desiredStart`, empujando hacia adelante los turnos
 * que quedarían solapados (cadena). Null si algún inicio supera las 18:00.
 */
export function planMoveWithPush(
  items: ScheduleItem[],
  movingId: number,
  desiredStart: string
): MovePlan | null {
  const active = activeScheduleItems(items);
  const moving = active.find((item) => item.id === movingId);
  if (!moving) return null;

  const cars = Math.max(1, Math.floor(moving.vehicleCount) || 1);
  if (!fitsInWorkday(desiredStart, cars)) return null;

  const moveStart = timeToMinutes(desiredStart);
  const moveEnd = moveStart + durationForVehicles(cars);
  const moveSlot = buildTimeSlot(desiredStart, cars);
  const lastStart = timeToMinutes(WORKDAY_LAST_START);

  const others = active
    .filter((item) => item.id !== movingId)
    .map((item) => {
      const otherCars = Math.max(1, Math.floor(item.vehicleCount) || 1);
      const slot = normalizeTimeSlot(item.timeSlot, otherCars);
      const parsed = parseTimeSlot(slot);
      if (!parsed) return null;
      return {
        id: item.id,
        clientName: item.clientName || `Turno #${item.id}`,
        cars: otherCars,
        fromSlot: slot,
        start: parsed.start,
        end: parsed.end,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => a.start - b.start || a.id - b.id);

  const pushes: ScheduleShift[] = [];
  /** Fin del bloque ya colocado (moved + empujados en cadena). */
  let fence = moveEnd;

  for (const other of others) {
    // Completamente antes del nuevo turno: no se toca.
    if (other.end <= moveStart) continue;

    // Cabe tal cual después del fence (sin solapar el moved ni los empujados).
    if (other.start >= fence) {
      fence = Math.max(fence, other.end);
      continue;
    }

    // Solapa o queda atrapado → empujar al fence.
    const newStart = snapMinutesToStartGrid(fence);
    if (newStart > lastStart) return null;

    const toSlot = buildTimeSlot(minutesToTime(newStart), other.cars);
    if (toSlot !== other.fromSlot) {
      pushes.push({
        id: other.id,
        clientName: other.clientName,
        fromSlot: other.fromSlot,
        toSlot,
        start: minutesToTime(newStart),
      });
    }
    fence = newStart + durationForVehicles(other.cars);
  }

  // Validación final: sin solapes.
  const slotById = new Map<number, string>([[movingId, moveSlot]]);
  for (const p of pushes) slotById.set(p.id, p.toSlot);
  const proposed: ScheduleItem[] = active.map((item) => ({
    id: item.id,
    clientName: item.clientName,
    status: item.status,
    vehicleCount: Math.max(1, Math.floor(item.vehicleCount) || 1),
    timeSlot:
      slotById.get(item.id) ||
      normalizeTimeSlot(item.timeSlot, Math.max(1, Math.floor(item.vehicleCount) || 1)),
  }));
  if (findOverlappingPairs(proposed).length > 0) return null;

  return {
    start: desiredStart,
    slot: moveSlot,
    pushes,
    direct: pushes.length === 0,
  };
}

/**
 * Inicios donde se puede colocar el turno: directo o empujando a otros.
 * Orden: sin empuje primero, luego por hora.
 */
export function availableStartsWithPush(items: ScheduleItem[], movingId: number): MovePlan[] {
  const moving = activeScheduleItems(items).find((item) => item.id === movingId);
  if (!moving) return [];

  const cars = Math.max(1, Math.floor(moving.vehicleCount) || 1);
  const plans: MovePlan[] = [];
  const seen = new Set<string>();

  for (const start of START_TIMES) {
    if (!fitsInWorkday(start, cars)) continue;
    const plan = planMoveWithPush(items, movingId, start);
    if (!plan || seen.has(plan.start)) continue;
    seen.add(plan.start);
    plans.push(plan);
  }

  plans.sort((a, b) => {
    if (a.direct !== b.direct) return a.direct ? -1 : 1;
    return timeToMinutes(a.start) - timeToMinutes(b.start);
  });

  return plans;
}

/** ¿Hay solapes activos en el día? */
export function dayHasOverlaps(items: ScheduleItem[]): boolean {
  return findOverlappingPairs(items).length > 0;
}
