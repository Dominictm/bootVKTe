import { addHours, setHours, setMilliseconds, setMinutes, setSeconds, startOfDay } from "date-fns";

export const CLUB_OPEN_HOUR = 10;
export const CLUB_CLOSE_HOUR = 22;
export const SLOT_DURATION_HOURS = 4;

export interface BusyInterval {
  start: Date;
  end: Date;
}

export function candidateStartHours(
  openHour: number = CLUB_OPEN_HOUR,
  closeHour: number = CLUB_CLOSE_HOUR,
  durationHours: number = SLOT_DURATION_HOURS
): number[] {
  const hours: number[] = [];
  for (let h = openHour; h + durationHours <= closeHour; h++) {
    hours.push(h);
  }
  return hours;
}

export function atHour(date: Date, hour: number): Date {
  return setMilliseconds(setSeconds(setMinutes(setHours(startOfDay(date), hour), 0), 0), 0);
}

export function isSlotFree(start: Date, end: Date, busy: BusyInterval[]): boolean {
  return !busy.some((b) => start < b.end && end > b.start);
}

export function getFreeSlotStarts(
  date: Date,
  busy: BusyInterval[],
  opts: { openHour?: number; closeHour?: number; durationHours?: number } = {}
): Date[] {
  const openHour = opts.openHour ?? CLUB_OPEN_HOUR;
  const closeHour = opts.closeHour ?? CLUB_CLOSE_HOUR;
  const durationHours = opts.durationHours ?? SLOT_DURATION_HOURS;

  return candidateStartHours(openHour, closeHour, durationHours)
    .map((h) => atHour(date, h))
    .filter((start) => isSlotFree(start, addHours(start, durationHours), busy));
}
