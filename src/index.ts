import { config } from "./config";
import { env } from "./env";
import { createWebServer } from "./web/server";
import { GoogleCalendarClient } from "./core/calendar";
import { BookingService } from "./core/booking";
import { createTelegramBot } from "./adapters/telegram/bot";
import { createVkBot } from "./adapters/vk/bot";

async function main() {
  const app = createWebServer();
  app.listen(env.port, () => {
    console.log(`Веб-панель настройки доступна на порту ${env.port}`);
  });

  if (!config.googleCalendarId || !config.googleApplicationCredentials) {
    console.warn("Google Calendar не настроен — боты не запущены. Настройте через веб-панель.");
    return;
  }

  const calendarClient = new GoogleCalendarClient(
    config.googleCalendarId,
    config.googleApplicationCredentials
  );
  const bookingService = new BookingService(calendarClient);

  const startPromises: Promise<unknown>[] = [];

  if (config.telegramBotToken) {
    const telegramBot = createTelegramBot(bookingService);
    startPromises.push(telegramBot.start());
  } else {
    console.warn("TELEGRAM_BOT_TOKEN не задан — Telegram-бот не запущен.");
  }

  if (config.vkToken) {
    const vkBot = createVkBot(bookingService);
    startPromises.push(vkBot.updates.start());
  } else {
    console.warn("VK_TOKEN не задан — VK-бот не запущен.");
  }

  await Promise.all(startPromises);
}

main().catch((err) => {
  console.error("Fatal error on startup:", err);
  process.exit(1);
});
