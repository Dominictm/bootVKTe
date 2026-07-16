import { Booking } from "./types";

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function formatBookingLabel(booking: Booking): string {
  return `${booking.table.prefix}, ${booking.start.toLocaleDateString("ru-RU")} ${formatTime(booking.start)}`;
}

export function formatWeekSchedule(bookings: Booking[]): string {
  if (bookings.length === 0) {
    return "На ближайшую неделю броней нет.";
  }
  const byDay = new Map<string, Booking[]>();
  for (const booking of bookings) {
    const key = booking.start.toLocaleDateString("ru-RU", {
      weekday: "short",
      day: "2-digit",
      month: "long",
    });
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(booking);
  }
  const lines: string[] = [];
  for (const [day, dayBookings] of byDay) {
    lines.push(day);
    for (const booking of dayBookings) {
      lines.push(`  ${booking.table.prefix}: ${formatTime(booking.start)}-${formatTime(booking.end)} — ${booking.name}`);
    }
  }
  return lines.join("\n");
}
