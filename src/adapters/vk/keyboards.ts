import { Keyboard } from "vk-io";
import { addDays, format } from "date-fns";
import { ru } from "date-fns/locale";
import { TABLES } from "../../core/tables";
import { Booking } from "../../core/types";
import { formatBookingLabel } from "../../core/format";

export function mainMenuKeyboard() {
  return Keyboard.builder()
    .callbackButton({ label: "Забронировать стол", payload: { action: "book" } })
    .row()
    .callbackButton({ label: "Мои брони", payload: { action: "my_bookings" } })
    .inline();
}

export function dateKeyboard() {
  const kb = Keyboard.builder();
  for (let i = 0; i < 7; i++) {
    const date = addDays(new Date(), i);
    const label = format(date, "dd.MM (EEEEEE)", { locale: ru });
    kb.callbackButton({ label, payload: { action: "date", date: format(date, "yyyy-MM-dd") } }).row();
  }
  return kb.inline();
}

export function tableKeyboard(dateStr: string) {
  const kb = Keyboard.builder();
  for (const table of TABLES) {
    kb.callbackButton({
      label: table.prefix,
      payload: { action: "table", date: dateStr, tableId: String(table.id) },
    }).row();
  }
  return kb.inline();
}

export function timeKeyboard(dateStr: string, tableId: number, starts: Date[]) {
  const kb = Keyboard.builder();
  for (const start of starts) {
    const hour = start.getHours().toString().padStart(2, "0");
    kb.callbackButton({
      label: `${hour}:00`,
      payload: { action: "time", date: dateStr, tableId: String(tableId), hour },
    }).row();
  }
  return kb.inline();
}

export function confirmKeyboard(dateStr: string, tableId: number, hour: string) {
  return Keyboard.builder()
    .callbackButton({
      label: "Подтвердить",
      payload: { action: "confirm", date: dateStr, tableId: String(tableId), hour },
    })
    .callbackButton({ label: "Отмена", payload: { action: "cancel" } })
    .inline();
}

export function bookingsKeyboard(bookings: Booking[]) {
  const kb = Keyboard.builder();
  for (const booking of bookings) {
    kb.callbackButton({
      label: formatBookingLabel(booking),
      payload: { action: "cancel_booking", eventId: booking.eventId },
    }).row();
  }
  return kb.inline();
}
