import { InlineKeyboard } from "grammy";
import { addDays, format } from "date-fns";
import { ru } from "date-fns/locale";
import { TABLES } from "../../core/tables";
import { Booking } from "../../core/types";
import { formatBookingLabel } from "../../core/format";

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text("Забронировать стол", "book").row().text("Мои брони", "my_bookings");
}

export function dateKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < 7; i++) {
    const date = addDays(new Date(), i);
    const label = format(date, "dd.MM (EEEEEE)", { locale: ru });
    kb.text(label, `date:${format(date, "yyyy-MM-dd")}`).row();
  }
  return kb;
}

export function tableKeyboard(dateStr: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const table of TABLES) {
    kb.text(table.prefix, `table:${dateStr}:${table.id}`).row();
  }
  return kb;
}

export function timeKeyboard(dateStr: string, tableId: number, starts: Date[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const start of starts) {
    const hour = start.getHours().toString().padStart(2, "0");
    kb.text(`${hour}:00`, `time:${dateStr}:${tableId}:${hour}`).row();
  }
  return kb;
}

export function confirmKeyboard(dateStr: string, tableId: number, hour: string): InlineKeyboard {
  return new InlineKeyboard()
    .text("Подтвердить", `confirm:${dateStr}:${tableId}:${hour}`)
    .text("Отмена", "cancel");
}

export function bookingsKeyboard(bookings: Booking[]): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const booking of bookings) {
    kb.text(formatBookingLabel(booking), `cancel_booking:${booking.eventId}`).row();
  }
  return kb;
}
