import { describe, expect, it } from "vitest";
import {
  START_TIMES,
  WORKDAY_START,
  WORKDAY_END,
  availableStartTimes,
  buildTimeSlot,
  computeFreeGaps,
  fitsInWorkday,
  mergeOccupiedRanges,
  timeToMinutes,
  washesThatFitInGap,
  earliestStartInGap,
  gapFitsVehicles,
} from "../shared/scheduling";

describe("scheduling continuum", () => {
  it("abre la jornada a las 07:30 y cierra a las 18:00", () => {
    expect(WORKDAY_START).toBe("07:30");
    expect(WORKDAY_END).toBe("18:00");
    expect(START_TIMES[0]).toBe("07:30");
    expect(START_TIMES).toContain("15:15");
    expect(START_TIMES).toContain("15:20");
    expect(START_TIMES).toContain("15:30");
  });

  it("calcula duración 1h20 por vehículo", () => {
    expect(buildTimeSlot("13:30", 1)).toBe("13:30 - 14:50");
    expect(buildTimeSlot("13:30", 2)).toBe("13:30 - 16:10");
  });

  it("deja hueco libre justo al terminar un lavado (sin franja)", () => {
    const occupied = [{ start: timeToMinutes("13:30"), end: timeToMinutes("14:50") }];
    const gaps = computeFreeGaps(occupied);
    expect(gaps).toEqual([
      { start: timeToMinutes("07:30"), end: timeToMinutes("13:30") },
      { start: timeToMinutes("14:50"), end: timeToMinutes("18:00") },
    ]);
    expect(washesThatFitInGap(gaps[1], 1)).toBeGreaterThanOrEqual(2);
  });

  it("permite agendar 15:15 / 15:20 / 15:30 si el anterior termina a las 15:00", () => {
    const free = availableStartTimes(1, ["13:30 - 15:00"]);
    expect(free).toContain("15:00");
    expect(free).toContain("15:15");
    expect(free).toContain("15:20");
    expect(free).toContain("15:30");
    expect(free).not.toContain("13:30");
    expect(free).not.toContain("14:00");
  });

  it("tras un lavado 13:30–14:50 deja libres 14:50 / 15:00 / 15:15", () => {
    const free = availableStartTimes(1, ["13:30 - 14:50"]);
    expect(free).toContain("14:50");
    expect(free).toContain("15:00");
    expect(free).toContain("15:15");
    expect(free).not.toContain("13:30");
    expect(free).not.toContain("14:00");
  });

  it("no permite un inicio que no entre antes de las 18:00", () => {
    expect(fitsInWorkday("16:50", 1)).toBe(false);
    expect(fitsInWorkday("16:40", 1)).toBe(true);
  });

  it("fusiona rangos solapados al calcular huecos", () => {
    const merged = mergeOccupiedRanges([
      { start: 100, end: 200 },
      { start: 180, end: 250 },
      { start: 300, end: 320 },
    ]);
    expect(merged).toEqual([
      { start: 100, end: 250 },
      { start: 300, end: 320 },
    ]);
  });

  it("encuentra el primer inicio válido dentro de un hueco", () => {
    const gap = { start: timeToMinutes("15:00"), end: timeToMinutes("18:00") };
    expect(earliestStartInGap(gap, 1)).toBe("15:00");
    expect(gapFitsVehicles(gap, 1)).toBe(true);
    expect(gapFitsVehicles({ start: timeToMinutes("12:40"), end: timeToMinutes("13:30") }, 1)).toBe(false);
  });
});
