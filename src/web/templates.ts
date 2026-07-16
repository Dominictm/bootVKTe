import { BotConfig } from "../config-store";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FIELD_LABELS: Record<keyof BotConfig, string> = {
  telegramBotToken: "Telegram Bot Token",
  vkToken: "VK Token",
  googleCalendarId: "Google Calendar ID",
  googleApplicationCredentials: "Путь к service-account.json",
  adminTelegramId: "Telegram ID администратора",
  adminVkId: "VK ID администратора",
};

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; }
  label { display: block; margin-top: 12px; font-weight: bold; }
  input { width: 100%; padding: 6px; box-sizing: border-box; }
  button { margin-top: 16px; padding: 8px 16px; }
  nav a { margin-right: 16px; }
  .notice { background: #e6ffe6; border: 1px solid #4caf50; padding: 8px 12px; margin-bottom: 16px; }
</style>
</head>
<body>
<nav><a href="/">Настройки</a><a href="/instructions">Инструкция</a></nav>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>`;
}

export interface SettingsPageOptions {
  configSaved: boolean;
  credentialsSaved: boolean;
  panelLogin: string;
}

export function settingsPage(config: BotConfig, opts: SettingsPageOptions): string {
  const fields = (Object.keys(FIELD_LABELS) as (keyof BotConfig)[])
    .map(
      (key) => `<label for="${key}">${FIELD_LABELS[key]}</label>
<input type="text" id="${key}" name="${key}" value="${escapeHtml(config[key])}">`
    )
    .join("\n");
  const configNotice = opts.configSaved
    ? `<div class="notice">Настройки сохранены. Перезапустите бота (stop → start), чтобы применить изменения.</div>`
    : "";
  const credentialsNotice = opts.credentialsSaved
    ? `<div class="notice">Логин и пароль обновлены. Перезапустите бота (stop → start), чтобы применить изменения.</div>`
    : "";
  return layout(
    "Настройки бота",
    `${configNotice}
<form method="post" action="/">
${fields}
<button type="submit">Сохранить</button>
</form>

<h2>Логин и пароль панели</h2>
${credentialsNotice}
<form method="post" action="/credentials">
<label for="panelLogin">Логин</label>
<input type="text" id="panelLogin" name="panelLogin" value="${escapeHtml(opts.panelLogin)}">
<label for="panelPassword">Новый пароль (оставьте пустым, чтобы не менять)</label>
<input type="password" id="panelPassword" name="panelPassword" value="">
<button type="submit">Сохранить логин и пароль</button>
</form>`
  );
}

export function instructionsPage(): string {
  return layout(
    "Инструкция по установке и настройке",
    `<h2>1. Service Account Google Calendar</h2>
<ol>
<li>В Google Cloud Console создайте проект и включите Google Calendar API.</li>
<li>Создайте Service Account, скачайте JSON-ключ как <code>service-account.json</code> и положите его в корень проекта.</li>
<li>В настройках календаря клуба откройте доступ email сервисного аккаунта (роль "Изменение мероприятий").</li>
<li>Скопируйте Calendar ID из настроек календаря.</li>
</ol>
<h2>2. Токены ботов</h2>
<ul>
<li>Telegram: создайте бота через <a href="https://t.me/BotFather" target="_blank">@BotFather</a>, скопируйте токен.</li>
<li>VK: создайте сообщество, Управление → Работа с API → Ключи доступа, создайте токен со scope <code>messages</code>.</li>
</ul>
<h2>3. Заполнение настроек</h2>
<p>Заполните форму на странице <a href="/">«Настройки»</a> и нажмите «Сохранить». После сохранения перезапустите бота.</p>
<h2>4. Запуск и остановка</h2>
<p><b>Windows:</b> запустите <code>start.bat</code> из корня проекта, остановите — <code>stop.bat</code>.</p>
<p><b>Linux (systemd):</b> <code>sudo systemctl restart club-bot</code>.</p>`
  );
}
