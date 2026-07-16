import { MessageContext, MessageEventContext, VK } from "vk-io";
import { addDays, parse } from "date-fns";
import { config } from "../../config";
import { BookingService, SlotTakenError, getTableById } from "../../core/booking";
import { BookingMeta } from "../../core/booking-meta";
import { formatWeekSchedule } from "../../core/format";
import {
  bookingsKeyboard,
  confirmKeyboard,
  dateKeyboard,
  mainMenuKeyboard,
  tableKeyboard,
  timeKeyboard,
} from "./keyboards";

interface PendingName {
  dateStr: string;
  tableId: number;
  hour: string;
}

const UNAVAILABLE_MESSAGE = "Сервис временно недоступен, попробуйте позже.";

export function createVkBot(bookingService: BookingService): VK {
  const vk = new VK({ token: config.vkToken });
  const pendingNames = new Map<number, PendingName>();
  const confirmingNames = new Map<string, string>();

  vk.updates.on("message_new", async (context: MessageContext) => {
    if (!context.hasText) return;
    const text = context.text!.trim();
    const userId = context.senderId;

    if (text === "/start") {
      await context.send("Здравствуйте! Я помогу забронировать стол.", { keyboard: mainMenuKeyboard() });
      return;
    }

    if (text === "/schedule") {
      if (!config.adminVkId || String(userId) !== config.adminVkId) return;
      const from = new Date();
      const to = addDays(from, 7);
      try {
        const bookings = await bookingService.getWeekSchedule(from, to);
        await context.send(formatWeekSchedule(bookings));
      } catch (err) {
        console.error("Failed to load schedule:", err);
        await context.send(UNAVAILABLE_MESSAGE);
      }
      return;
    }

    const pending = pendingNames.get(userId);
    if (pending) {
      pendingNames.delete(userId);
      const table = getTableById(pending.tableId);
      const key = `${pending.dateStr}:${pending.tableId}:${pending.hour}:${userId}`;
      confirmingNames.set(key, text);
      await context.send(
        `Подтвердите бронь: ${table.prefix}, ${pending.dateStr} в ${pending.hour}:00, имя: ${text}`,
        { keyboard: confirmKeyboard(pending.dateStr, pending.tableId, pending.hour) }
      );
    }
  });

  vk.updates.on("message_event", async (context: MessageEventContext) => {
    const payload = context.eventPayload as Record<string, string>;
    const userId = context.userId;
    // context.answer() requires an eventData action (snackbar/link/app) we don't need here;
    // the raw API call below just clears the button's loading state without one.
    await vk.api.messages.sendMessageEventAnswer({
      event_id: context.eventId,
      user_id: context.userId,
      peer_id: context.peerId,
    });

    switch (payload.action) {
      case "book": {
        await context.send("Выберите дату:", { keyboard: dateKeyboard() });
        break;
      }
      case "my_bookings": {
        const from = new Date();
        const to = addDays(from, 30);
        try {
          const bookings = await bookingService.listMyBookings("vk", String(userId), from, to);
          if (bookings.length === 0) {
            await context.send("У вас нет активных броней.");
          } else {
            await context.send("Ваши брони:", { keyboard: bookingsKeyboard(bookings) });
          }
        } catch (err) {
          console.error("Failed to load bookings:", err);
          await context.send(UNAVAILABLE_MESSAGE);
        }
        break;
      }
      case "date": {
        await context.send("Выберите стол:", { keyboard: tableKeyboard(payload.date) });
        break;
      }
      case "table": {
        const table = getTableById(Number(payload.tableId));
        const date = parse(payload.date, "yyyy-MM-dd", new Date());
        try {
          const starts = await bookingService.getFreeSlots(table, date);
          if (starts.length === 0) {
            await context.send("На эту дату свободных окон нет.", { keyboard: dateKeyboard() });
          } else {
            await context.send("Выберите время начала:", {
              keyboard: timeKeyboard(payload.date, table.id, starts),
            });
          }
        } catch (err) {
          console.error("Failed to load availability:", err);
          await context.send(UNAVAILABLE_MESSAGE);
        }
        break;
      }
      case "time": {
        pendingNames.set(userId, {
          dateStr: payload.date,
          tableId: Number(payload.tableId),
          hour: payload.hour,
        });
        await context.send("Введите имя для брони:");
        break;
      }
      case "confirm": {
        const key = `${payload.date}:${payload.tableId}:${payload.hour}:${userId}`;
        const name = confirmingNames.get(key);
        if (!name) {
          await context.send("Сессия истекла, начните заново.");
          break;
        }
        confirmingNames.delete(key);
        const table = getTableById(Number(payload.tableId));
        const date = parse(payload.date, "yyyy-MM-dd", new Date());
        const start = new Date(date);
        start.setHours(Number(payload.hour), 0, 0, 0);
        const meta: BookingMeta = { platform: "vk", userId: String(userId), username: `id${userId}` };
        try {
          await bookingService.createBooking(table, start, name, meta);
          await context.send("Забронировано ✅");
        } catch (err) {
          if (err instanceof SlotTakenError) {
            await context.send("Это время уже заняли. Выберите другое.");
          } else {
            console.error("Booking failed:", err);
            await context.send(UNAVAILABLE_MESSAGE);
          }
        }
        break;
      }
      case "cancel_booking": {
        try {
          await bookingService.cancelBooking(payload.eventId);
          await context.send("Бронь отменена.");
        } catch (err) {
          console.error("Failed to cancel booking:", err);
          await context.send(UNAVAILABLE_MESSAGE);
        }
        break;
      }
      case "cancel": {
        await context.send("Отменено.", { keyboard: mainMenuKeyboard() });
        break;
      }
    }
  });

  return vk;
}
