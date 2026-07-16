import { describe, expect, it } from "vitest";
import { atHour, candidateStartHours, getFreeSlotStarts, isSlotFree } from "./availability";

describe("candidateStartHours", () => {
  it("returns every hour where a 4-hour slot fits between 10:00 and 22:00", () => {
    expect(candidateStartHours(10, 22, 4)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it("returns an empty list when the window is shorter than the slot", () => {
    expect(candidateStartHours(10, 12, 4)).toEqual([]);
  });
});

describe("isSlotFree", () => {
  it("is free when there are no busy intervals", () => {
    const start = new Date(2026, 6, 20, 10, 0);
    const end = new Date(2026, 6, 20, 14, 0);
    expect(isSlotFree(start, end, [])).toBe(true);
  });

  it("is not free when a busy interval overlaps the middle of the slot", () => {
    const start = new Date(2026, 6, 20, 10, 0);
    const end = new Date(2026, 6, 20, 14, 0);
    const busy = [{ start: new Date(2026, 6, 20, 12, 0), end: new Date(2026, 6, 20, 13, 0) }];
    expect(isSlotFree(start, end, busy)).toBe(false);
  });

  it("is free when a busy interval ends exactly when the slot starts", () => {
    const start = new Date(2026, 6, 20, 14, 0);
    const end = new Date(2026, 6, 20, 18, 0);
    const busy = [{ start: new Date(2026, 6, 20, 10, 0), end: new Date(2026, 6, 20, 14, 0) }];
    expect(isSlotFree(start, end, busy)).toBe(true);
  });

  it("is free when a busy interval starts exactly when the slot ends", () => {
    const start = new Date(2026, 6, 20, 10, 0);
    const end = new Date(2026, 6, 20, 14, 0);
    const busy = [{ start: new Date(2026, 6, 20, 14, 0), end: new Date(2026, 6, 20, 18, 0) }];
    expect(isSlotFree(start, end, busy)).toBe(true);
  });
});

describe("getFreeSlotStarts", () => {
  const day = new Date(2026, 6, 20, 15, 30); // arbitrary time on the target day

  it("returns all 9 candidate starts when the day is fully free", () => {
    const starts = getFreeSlotStarts(day, []);
    expect(starts).toHaveLength(9);
    expect(starts[0]).toEqual(atHour(day, 10));
    expect(starts[8]).toEqual(atHour(day, 18));
  });

  it("returns no starts when the whole day is booked", () => {
    const busy = [{ start: atHour(day, 10), end: atHour(day, 22) }];
    expect(getFreeSlotStarts(day, busy)).toEqual([]);
  });

  it("excludes only the starts whose 4-hour window overlaps a 1-hour booking", () => {
    // Busy 12:00-13:00 overlaps windows starting at 10, 11, 12 (their ends are 14, 15, 16,
    // all after 12:00), but not 13:00 onward (13:00-17:00 starts exactly when the busy ends).
    const busy = [{ start: atHour(day, 12), end: atHour(day, 13) }];
    const starts = getFreeSlotStarts(day, busy);
    const hours = starts.map((s) => s.getHours());
    expect(hours).toEqual([13, 14, 15, 16, 17, 18]);
  });
});
