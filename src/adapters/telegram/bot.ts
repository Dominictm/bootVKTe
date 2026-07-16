import { Bot } from "grammy";
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

export function createTelegramBot(bookingService: BookingService): Bot {
  const bot = new Bot(config.telegramBotToken);
  const pendingNames = new Map<number, PendingName>();
  const confirmingNames = new Map<string, string>();

  bot.command("start", async (ctx) => {
    await ctx.reply("Здравствуйте! Я помогу забронировать стол.", {
      reply_markup: mainMenuKeyboard(),
    });
  });

  bot.command("schedule", async (ctx) => {
    const userId = String(ctx.from?.id ?? "");
    if (!config.adminTelegramId || userId !== config.adminTelegramId) {
      return;
    }
    const from = new Date();
    const to = addDays(from, 7);
    try {
      const bookings = await bookingService.getWeekSchedule(from, to);
      await ctx.reply(formatWeekSchedule(bookings));
    } catch (err) {
      console.error("Failed to load schedule:", err);
      await ctx.reply(UNAVAILABLE_MESSAGE);
    }
  });

  bot.callbackQuery("book", async (ctx) => {
    await ctx.editMessageText("Выберите дату:", { reply_markup: dateKeyboard() });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("my_bookings", async (ctx) => {
    const userId = String(ctx.from.id);
    const from = new Date();
    const to = addDays(from, 30);
    try {
      const bookings = await bookingService.listMyBookings("telegram", userId, from, to);
      if (bookings.length === 0) {
        await ctx.editMessageText("У вас нет активных броней.");
      } else {
        await ctx.editMessageText("Ваши брони:", { reply_markup: bookingsKeyboard(bookings) });
      }
    } catch (err) {
      console.error("Failed to load bookings:", err);
      await ctx.editMessageText(UNAVAILABLE_MESSAGE);
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^date:(.+)$/, async (ctx) => {
    const dateStr = ctx.match![1];
    await ctx.editMessageText("Выберите стол:", { reply_markup: tableKeyboard(dateStr) });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^table:(.+):(\d+)$/, async (ctx) => {
    const dateStr = ctx.match![1];
    const tableId = Number(ctx.match![2]);
    const table = getTableById(tableId);
    const date = parse(dateStr, "yyyy-MM-dd", new Date());
    try {
      const starts = await bookingService.getFreeSlots(table, date);
      if (starts.length === 0) {
        await ctx.editMessageText("На эту дату свободных окон нет.", { reply_markup: dateKeyboard() });
      } else {
        await ctx.editMessageText("Выберите время начала:", {
          reply_markup: timeKeyboard(dateStr, tableId, starts),
        });
      }
    } catch (err) {
      console.error("Failed to load availability:", err);
      await ctx.editMessageText(UNAVAILABLE_MESSAGE);
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^time:(.+):(\d+):(\d+)$/, async (ctx) => {
    const [, dateStr, tableIdStr, hour] = ctx.match!;
    pendingNames.set(ctx.chat!.id, { dateStr, tableId: Number(tableIdStr), hour });
    await ctx.editMessageText("Введите имя для брони:");
    await ctx.answerCallbackQuery();
  });

  bot.on("message:text", async (ctx) => {
    const pending = pendingNames.get(ctx.chat.id);
    if (!pending) return;
    pendingNames.delete(ctx.chat.id);
    const name = ctx.message.text.trim();
    const table = getTableById(pending.tableId);
    const key = `${pending.dateStr}:${pending.tableId}:${pending.hour}:${ctx.chat.id}`;
    confirmingNames.set(key, name);
    await ctx.reply(
      `Подтвердите бронь: ${table.prefix}, ${pending.dateStr} в ${pending.hour}:00, имя: ${name}`,
      { reply_markup: confirmKeyboard(pending.dateStr, pending.tableId, pending.hour) }
    );
  });

  bot.callbackQuery(/^confirm:(.+):(\d+):(\d+)$/, async (ctx) => {
    const [, dateStr, tableIdStr, hour] = ctx.match!;
    const key = `${dateStr}:${tableIdStr}:${hour}:${ctx.chat!.id}`;
    const name = confirmingNames.get(key);
    if (!name) {
      await ctx.answerCallbackQuery({ text: "Сессия истекла, начните заново." });
      return;
    }
    confirmingNames.delete(key);
    const table = getTableById(Number(tableIdStr));
    const date = parse(dateStr, "yyyy-MM-dd", new Date());
    const start = new Date(date);
    start.setHours(Number(hour), 0, 0, 0);
    const meta: BookingMeta = {
      platform: "telegram",
      userId: String(ctx.from!.id),
      username: ctx.from!.username ?? ctx.from!.first_name ?? "клиент",
    };
    try {
      await bookingService.createBooking(table, start, name, meta);
      await ctx.editMessageText("Забронировано ✅");
    } catch (err) {
      if (err instanceof SlotTakenError) {
        await ctx.editMessageText("Это время уже заняли. Выберите другое.");
      } else {
        console.error("Booking failed:", err);
        await ctx.editMessageText(UNAVAILABLE_MESSAGE);
      }
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^cancel_booking:(.+)$/, async (ctx) => {
    const eventId = ctx.match![1];
    try {
      await bookingService.cancelBooking(eventId);
      await ctx.editMessageText("Бронь отменена.");
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      await ctx.editMessageText(UNAVAILABLE_MESSAGE);
    }
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery("cancel", async (ctx) => {
    await ctx.editMessageText("Отменено.", { reply_markup: mainMenuKeyboard() });
    await ctx.answerCallbackQuery();
  });

  bot.catch((err) => {
    console.error("Unhandled Telegram bot error:", err);
  });

  return bot;
}
