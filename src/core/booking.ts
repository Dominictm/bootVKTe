import { addHours, endOfDay, startOfDay } from "date-fns";
import { getFreeSlotStarts, BusyInterval, SLOT_DURATION_HOURS } from "./availability";
import { CalendarClient, CalendarEvent } from "./calendar";
import { BookingMeta, decodeDescription, encodeDescription, matchesUser } from "./booking-meta";
import { getTableById, Table, TABLES } from "./tables";
import { Booking } from "./types";

export class SlotTakenError extends Error {
  constructor() {
    super("This slot was just taken by someone else");
    this.name = "SlotTakenError";
  }
}

function eventsForTable(events: CalendarEvent[], table: Table): CalendarEvent[] {
  return events.filter((e) => e.summary.startsWith(table.prefix));
}

function tableForEvent(event: CalendarEvent): Table | undefined {
  return TABLES.find((t) => event.summary.startsWith(t.prefix));
}

function eventClientName(event: CalendarEvent, table: Table): string {
  return event.summary.slice(table.prefix.length).replace(/^:\s*/, "").trim();
}

export class BookingService {
  constructor(private readonly calendar: CalendarClient) {}

  async getFreeSlots(table: Table, date: Date): Promise<Date[]> {
    const events = await this.calendar.listEvents(startOfDay(date), endOfDay(date));
    const busy: BusyInterval[] = eventsForTable(events, table).map((e) => ({
      start: e.start,
      end: e.end,
    }));
    return getFreeSlotStarts(date, busy);
  }

  async createBooking(table: Table, start: Date, name: string, meta: BookingMeta): Promise<Booking> {
    const end = addHours(start, SLOT_DURATION_HOURS);
    const freeStarts = await this.getFreeSlots(table, start);
    const stillFree = freeStarts.some((s) => s.getTime() === start.getTime());
    if (!stillFree) {
      throw new SlotTakenError();
    }
    const summary = `${table.prefix}: ${name}`;
    const description = encodeDescription(meta);
    const eventId = await this.calendar.createEvent(summary, description, start, end);
    return { eventId, table, start, end, name };
  }

  async listMyBookings(
    platform: "telegram" | "vk",
    userId: string,
    from: Date,
    to: Date
  ): Promise<Booking[]> {
    const events = await this.calendar.listEvents(from, to);
    const bookings: Booking[] = [];
    for (const event of events) {
      const meta = decodeDescription(event.description);
      if (!matchesUser(meta, platform, userId)) continue;
      const table = tableForEvent(event);
      if (!table) continue;
      bookings.push({
        eventId: event.id,
        table,
        start: event.start,
        end: event.end,
        name: eventClientName(event, table),
      });
    }
    return bookings;
  }

  async cancelBooking(eventId: string): Promise<void> {
    await this.calendar.deleteEvent(eventId);
  }

  async getWeekSchedule(from: Date, to: Date): Promise<Booking[]> {
    const events = await this.calendar.listEvents(from, to);
    const bookings: Booking[] = [];
    for (const event of events) {
      const table = tableForEvent(event);
      if (!table) continue;
      bookings.push({
        eventId: event.id,
        table,
        start: event.start,
        end: event.end,
        name: eventClientName(event, table),
      });
    }
    return bookings.sort((a, b) => a.start.getTime() - b.start.getTime());
  }
}

// getTableById is re-exported for adapter convenience so they only need one import path
// for table lookups alongside booking operations.
export { getTableById };
