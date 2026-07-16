import fs from "fs";
import path from "path";

export interface BotConfig {
  telegramBotToken: string;
  vkToken: string;
  googleCalendarId: string;
  googleApplicationCredentials: string;
  adminTelegramId: string;
  adminVkId: string;
}

const CONFIG_PATH = path.join(process.cwd(), "config.json");

export function emptyBotConfig(): BotConfig {
  return {
    telegramBotToken: "",
    vkToken: "",
    googleCalendarId: "",
    googleApplicationCredentials: "./service-account.json",
    adminTelegramId: "",
    adminVkId: "",
  };
}

export function readBotConfig(): BotConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return emptyBotConfig();
  }
  const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
  const parsed = JSON.parse(raw) as Partial<BotConfig>;
  return { ...emptyBotConfig(), ...parsed };
}

export function writeBotConfig(data: BotConfig): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), "utf-8");
}
