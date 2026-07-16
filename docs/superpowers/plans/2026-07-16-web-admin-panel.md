# Web Admin Panel & Start/Stop Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a web-based settings panel (port 8546, Basic Auth) that lets an admin fill in Telegram/VK tokens and Google Calendar settings without editing files by hand, plus `start.bat`/`stop.bat` for Windows and reuse of the existing systemd unit for Linux, so the bot works on either hosting target.

**Architecture:** The existing `index.ts` process is extended to always start an Express web server (settings form + instructions page, both behind Basic Auth) alongside the existing Telegram/VK adapters. Bot connection settings move out of `.env` into a new `config.json` (read/written by a small `config-store` module); `.env` is reduced to the web panel's own login/password/port. Settings changes require a manual restart (`stop.bat` + `start.bat`, or `systemctl restart`) to take effect — there is no live reload.

**Tech Stack:** Express (new dependency) added to the existing Node.js/TypeScript stack. No new test framework — this feature is verified manually per the checklist in Task 8, consistent with how the rest of the bot's adapters are verified.

Full design reference: `docs/superpowers/specs/2026-07-16-club-booking-bot-design.md` (section "Веб-панель настройки и запуск").

**Starting state:** The base bot (Tasks 1–15 of the previous plan) is already implemented and committed. This plan only adds the web panel and start/stop scripts on top of it. Existing files referenced below already exist unless marked "Create".

---

## Task 1: Add Express Dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `express` and `@types/express` to `package.json`**

Change the `dependencies` and `devDependencies` blocks to:

```json
  "dependencies": {
    "date-fns": "^3.6.0",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "googleapis": "^140.0.0",
    "grammy": "^1.28.0",
    "vk-io": "^4.9.1"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "vitest": "^1.6.0"
  }
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: `express` and `@types/express` appear in `node_modules/`, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add express dependency for the web admin panel"
```

---

## Task 2: Config Store (config.json read/write)

**Files:**
- Create: `src/config-store.ts`

- [ ] **Step 1: Create `src/config-store.ts`**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/config-store.ts
git commit -m "feat: add config.json read/write store for bot connection settings"
```

---

## Task 3: Split Environment Config (panel-only) from Bot Config (config.json)

**Files:**
- Create: `src/env.ts`
- Modify: `src/config.ts`
- Modify: `.env.example`
- Create: `config.example.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create `src/env.ts`**

```typescript
import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 8546),
  webAdminLogin: requireEnv("WEB_ADMIN_LOGIN"),
  webAdminPassword: requireEnv("WEB_ADMIN_PASSWORD"),
};
```

- [ ] **Step 2: Replace the contents of `src/config.ts`**

The old `src/config.ts` read bot tokens from `.env` via `requireEnv`. Replace its entire
contents with:

```typescript
import { readBotConfig } from "./config-store";

export const config = readBotConfig();
```

- [ ] **Step 3: Replace `.env.example`**

```
PORT=8546
WEB_ADMIN_LOGIN=
WEB_ADMIN_PASSWORD=
```

- [ ] **Step 4: Create `config.example.json`**

```json
{
  "telegramBotToken": "",
  "vkToken": "",
  "googleCalendarId": "",
  "googleApplicationCredentials": "./service-account.json",
  "adminTelegramId": "",
  "adminVkId": ""
}
```

- [ ] **Step 5: Add `config.json` to `.gitignore`**

Replace `.gitignore` contents with:

```
node_modules/
dist/
.env
config.json
service-account.json
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. (`src/index.ts`, `src/adapters/telegram/bot.ts` and
`src/adapters/vk/bot.ts` still import `config` from `./config` /
`../../config` and read `config.telegramBotToken`, `config.vkToken`,
`config.adminTelegramId`, `config.adminVkId`, `config.googleCalendarId`,
`config.googleApplicationCredentials` — all field names are unchanged, so
those files need no edits yet.)

- [ ] **Step 7: Commit**

```bash
git add src/env.ts src/config.ts .env.example config.example.json .gitignore
git commit -m "refactor: move bot connection settings from .env to config.json"
```

---

## Task 4: HTML Templates for the Web Panel

**Files:**
- Create: `src/web/templates.ts`

- [ ] **Step 1: Create `src/web/templates.ts`**

```typescript
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

export function settingsPage(config: BotConfig, saved: boolean): string {
  const fields = (Object.keys(FIELD_LABELS) as (keyof BotConfig)[])
    .map(
      (key) => `<label for="${key}">${FIELD_LABELS[key]}</label>
<input type="text" id="${key}" name="${key}" value="${escapeHtml(config[key])}">`
    )
    .join("\n");
  const notice = saved
    ? `<div class="notice">Настройки сохранены. Перезапустите бота (stop → start), чтобы применить изменения.</div>`
    : "";
  return layout(
    "Настройки бота",
    `${notice}
<form method="post" action="/">
${fields}
<button type="submit">Сохранить</button>
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/templates.ts
git commit -m "feat: add HTML templates for the settings and instructions pages"
```

---

## Task 5: Web Server (Basic Auth + Settings Form + Instructions)

**Files:**
- Create: `src/web/server.ts`

- [ ] **Step 1: Create `src/web/server.ts`**

```typescript
import express, { Express, NextFunction, Request, Response } from "express";
import { env } from "../env";
import { BotConfig, emptyBotConfig, readBotConfig, writeBotConfig } from "../config-store";
import { instructionsPage, settingsPage } from "./templates";

function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    const separatorIndex = decoded.indexOf(":");
    const login = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    if (login === env.webAdminLogin && password === env.webAdminPassword) {
      next();
      return;
    }
  }
  res.set("WWW-Authenticate", 'Basic realm="Club Bot Admin"');
  res.status(401).send("Authentication required");
}

export function createWebServer(): Express {
  const app = express();
  app.use(basicAuth);
  app.use(express.urlencoded({ extended: false }));

  app.get("/", (req, res) => {
    const config = readBotConfig();
    const saved = req.query.saved === "1";
    res.type("html").send(settingsPage(config, saved));
  });

  app.post("/", (req, res) => {
    const defaults = emptyBotConfig();
    const next: BotConfig = {
      telegramBotToken: String(req.body.telegramBotToken ?? "").trim(),
      vkToken: String(req.body.vkToken ?? "").trim(),
      googleCalendarId: String(req.body.googleCalendarId ?? "").trim(),
      googleApplicationCredentials:
        String(req.body.googleApplicationCredentials ?? "").trim() ||
        defaults.googleApplicationCredentials,
      adminTelegramId: String(req.body.adminTelegramId ?? "").trim(),
      adminVkId: String(req.body.adminVkId ?? "").trim(),
    };
    writeBotConfig(next);
    res.redirect("/?saved=1");
  });

  app.get("/instructions", (_req, res) => {
    res.type("html").send(instructionsPage());
  });

  return app;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/web/server.ts
git commit -m "feat: add web admin panel server with basic auth"
```

---

## Task 6: Wire Web Server into Entry Point, Make Adapters Optional

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace the contents of `src/index.ts`**

```typescript
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
```

- [ ] **Step 2: Verify the full project builds**

Run: `npm run build`
Expected: `dist/` contains compiled output including `dist/web/server.js` and
`dist/config-store.js`, no TypeScript errors.

- [ ] **Step 3: Verify existing unit tests still pass**

Run: `npm test`
Expected: PASS, `availability.test.ts` and `booking-meta.test.ts` unaffected.

- [ ] **Step 4: Manual smoke test — panel runs even with no config.json**

```bash
# from BootTeVK/, with a .env containing PORT, WEB_ADMIN_LOGIN, WEB_ADMIN_PASSWORD
# and no config.json present yet
npm run build && npm start
```

Expected console output includes `Веб-панель настройки доступна на порту 8546`
and `Google Calendar не настроен — боты не запущены. Настройте через веб-панель.`,
and the process keeps running (does not exit). Stop with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: start web admin panel and make bot adapters optional based on config.json"
```

---

## Task 7: Windows start/stop Scripts

**Files:**
- Create: `start.bat`
- Create: `stop.bat`

- [ ] **Step 1: Create `start.bat`**

```bat
@echo off
cd /d %~dp0
start "club-bot" node dist\index.js
echo Bot started in a new window titled "club-bot". Check that window for logs.
```

- [ ] **Step 2: Create `stop.bat`**

```bat
@echo off
taskkill /FI "WINDOWTITLE eq club-bot*" /T /F >nul 2>&1
if %ERRORLEVEL%==0 (
  echo Bot stopped.
) else (
  echo No running club-bot process found ^(it may already be stopped^).
)
```

- [ ] **Step 3: Manual verification**

Run: `start.bat`
Expected: a new console window titled "club-bot" opens and prints the same
startup log lines as `npm start` (web panel port message, and either bot
start confirmation or the "not configured" warnings).

Run: `stop.bat`
Expected: the "club-bot" window closes and the script prints "Bot stopped."

- [ ] **Step 4: Commit**

```bash
git add start.bat stop.bat
git commit -m "chore: add Windows start/stop scripts"
```

---

## Task 8: Update README and Final Manual Verification Checklist

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the "Setup" section of `README.md`**

Replace the existing `### 3. Environment` subsection (the one that has the
client fill in `TELEGRAM_BOT_TOKEN`, `VK_TOKEN`, etc. directly in `.env`)
with:

```markdown
### 3. Web admin panel credentials

```bash
cp .env.example .env
```

Fill in `.env` with only the panel's own login credentials and port:

```
PORT=8546
WEB_ADMIN_LOGIN=<choose a login>
WEB_ADMIN_PASSWORD=<choose a password>
```

### 4. Install, build, run

```bash
npm install
npm run build
npm start
```

Or on Windows, after building once, use `start.bat` / `stop.bat` instead of
`npm start`.

### 5. Configure bot tokens via the web panel

Open `http://<server-address>:8546/` in a browser, log in with
`WEB_ADMIN_LOGIN` / `WEB_ADMIN_PASSWORD`, and fill in:

- Telegram Bot Token
- VK Token
- Google Calendar ID
- Path to `service-account.json`
- Admin Telegram ID / Admin VK ID (for `/schedule`)

Click "Сохранить", then restart the bot (`stop.bat` + `start.bat`, or
`sudo systemctl restart club-bot`) to apply the new settings. Full
step-by-step instructions are also available at `/instructions` inside the
panel itself.
```

Renumber any remaining subsections after this one accordingly (the old
"Install, build, run locally" and "Deployment" subsections either get merged
into the above or keep their content but shift numbering — keep the systemd
deployment instructions as they are, just update the `.env` reference there
to note it now only holds panel credentials, not bot tokens).

- [ ] **Step 2: Add web-panel items to the Manual Verification Checklist**

Add these lines to the existing "## Manual Verification Checklist" section
in `README.md`:

```markdown
- [ ] Starting the bot with no `config.json` present still serves the web
      panel at `http://localhost:8546/` and logs a warning instead of
      crashing.
- [ ] The panel at `/` requires Basic Auth — wrong credentials get a 401.
- [ ] Filling in the settings form and saving writes `config.json`, shows
      "Настройки сохранены...", and the values persist after reloading `/`.
- [ ] `/instructions` renders without authentication errors once logged in.
- [ ] After saving new tokens and restarting (`stop.bat` + `start.bat`, or
      `npm start` again locally), the Telegram/VK bots come up using the
      newly saved `config.json`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document web admin panel setup and update verification checklist"
```

---

## Self-Review Notes

- **Spec coverage:** web server on port 8546 (env-configurable, default 8546)
  — Task 6; config.json storage — Task 2; `.env` reduced to panel
  login/password/port — Task 3; Basic Auth — Task 5; settings form +
  instructions page — Tasks 4–5; manual-restart-to-apply flow — Task 5 (save
  notice) + Task 8 (checklist); Windows start/stop scripts — Task 7;
  existing systemd unit reused unchanged (no task needed, already present
  from the base plan).
- **Type consistency checked:** `BotConfig` is defined once in
  `config-store.ts` (Task 2) and reused unchanged by `config.ts` (Task 3),
  `templates.ts` (Task 4), and `server.ts` (Task 5) — same six field names
  throughout (`telegramBotToken`, `vkToken`, `googleCalendarId`,
  `googleApplicationCredentials`, `adminTelegramId`, `adminVkId`), matching
  the pre-existing fields on the `config` object that `index.ts` and both
  adapters already read.
- **No placeholders:** every step has complete, runnable code; the README
  step spells out the exact replacement text rather than saying "update the
  docs."
