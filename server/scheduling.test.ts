import { describe, expect, it } from "vitest";
import {
  START_TIMES,
  WORKDAY_START,
  WORKDAY_LAST_START,
  availableStartTimes,
  buildTimeSlot,
  computeFreeGaps,
  fitsInWorkday,
  mergeOccupiedRanges,
  normalizeTimeSlot,
  timeToMinutes,
  washesThatFitInGap,
  earliestStartInGap,
  gapFitsVehicles,
  withNormalizedTimeSlot,
} from "../shared/scheduling";

describe("scheduling continuum", () => {
  it("toma trabajos de 07:30 a 18:00 (último inicio inclusive)", () => {
    expect(WORKDAY_START).toBe("07:30");
    expect(WORKDAY_LAST_START).toBe("18:00");
    expect(START_TIMES[0]).toBe("07:30");
    expect(START_TIMES).toContain("15:15");
    expect(START_TIMES).toContain("18:00");
    expect(START_TIMES.at(-1)).toBe("18:00");
  });

  it("calcula duración 1h20 por vehículo (puede terminar después de las 18)", () => {
    expect(buildTimeSlot("13:30", 1)).toBe("13:30 - 14:50");
    expect(buildTimeSlot("13:30", 2)).toBe("13:30 - 16:10");
    expect(buildTimeSlot("13:30", 3)).toBe("13:30 - 17:30");
    expect(buildTimeSlot("09:30", 3)).toBe("09:30 - 13:30");
    expect(buildTimeSlot("18:00", 1)).toBe("18:00 - 19:20");
  });

  it("normaliza franjas viejas de 90 min a N×80", () => {
    expect(normalizeTimeSlot("09:30 - 11:00", 3)).toBe("09:30 - 13:30");
    expect(normalizeTimeSlot("13:30 - 15:00", 1)).toBe("13:30 - 14:50");
    expect(
      withNormalizedTimeSlot({
        timeSlot: "09:30 - 11:00",
        vehicleCount: 3,
        vehicles: "[{},{},{}]",
      }).timeSlot
    ).toBe("09:30 - 13:30");
  });

  it("deja hueco libre justo al terminar un lavado (sin franja)", () => {
    const occupied = [{ start: timeToMinutes("13:30"), end: timeToMinutes("14:50") }];
    const gaps = computeFreeGaps(occupied);
    expect(gaps[0]).toEqual({ start: timeToMinutes("07:30"), end: timeToMinutes("13:30") });
    expect(gaps[1].start).toBe(timeToMinutes("14:50"));
    expect(gaps[1].end).toBeGreaterThan(timeToMinutes("18:00"));
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

  it("18:00 es último inicio válido aunque el lavado termine después", () => {
    expect(fitsInWorkday("16:50", 1)).toBe(true);
    expect(fitsInWorkday("18:00", 1)).toBe(true);
    expect(fitsInWorkday("18:05", 1)).toBe(false);
    expect(fitsInWorkday("07:25", 1)).toBe(false);
  });

  it("si el anterior termina a las 18:00, aún se puede agarrar a las 18:00", () => {
    const free = availableStartTimes(1, ["14:00 - 18:00"]);
    expect(free).toContain("18:00");
    expect(free).not.toContain("17:00");
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
    const gap = { start: timeToMinutes("15:00"), end: timeToMinutes("18:05") };
    expect(earliestStartInGap(gap, 1)).toBe("15:00");
    expect(gapFitsVehicles(gap, 1)).toBe(true);
    expect(gapFitsVehicles({ start: timeToMinutes("12:40"), end: timeToMinutes("13:30") }, 1)).toBe(
      false
    );
  });
});
