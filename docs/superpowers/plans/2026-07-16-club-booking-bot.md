# Club Table-Booking Bot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js/TypeScript bot that runs on both Telegram and VK, lets clients see free 4-hour table slots (10:00–22:00, 3 tables) in a shared Google Calendar, book and cancel their own slots, and lets an admin view the week's schedule via `/schedule`.

**Architecture:** A platform-independent `core` (availability math, Google Calendar client, booking service, metadata encoding, text formatting) is consumed by two thin adapters — one for Telegram (grammY) and one for VK (vk-io) — each owning only its own keyboard rendering and per-chat conversation state. A single `index.ts` wires everything together and starts both adapters as long-lived polling processes.

**Tech Stack:** TypeScript (CommonJS, compiled with `tsc`), grammY (Telegram), vk-io (VK), googleapis (Google Calendar, Service Account auth), date-fns, dotenv, vitest for unit tests, systemd for process supervision.

Full design reference: `docs/superpowers/specs/2026-07-16-club-booking-bot-design.md`.

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "club-bot",
  "version": "1.0.0",
  "private": true,
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "date-fns": "^3.6.0",
    "dotenv": "^16.4.5",
    "googleapis": "^140.0.0",
    "grammy": "^1.28.0",
    "vk-io": "^4.9.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "tsx": "^4.16.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` created, no errors.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.env
service-account.json
```

- [ ] **Step 6: Create `.env.example`**

```
TELEGRAM_BOT_TOKEN=
VK_TOKEN=
GOOGLE_CALENDAR_ID=
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
ADMIN_TELEGRAM_ID=
ADMIN_VK_ID=
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example
git commit -m "chore: scaffold TypeScript project"
```

---

## Task 2: Config Loader

**Files:**
- Create: `src/config.ts`

- [ ] **Step 1: Create `src/config.ts`**

```typescript
import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  telegramBotToken: requireEnv("TELEGRAM_BOT_TOKEN"),
  vkToken: requireEnv("VK_TOKEN"),
  googleCalendarId: requireEnv("GOOGLE_CALENDAR_ID"),
  googleApplicationCredentials: requireEnv("GOOGLE_APPLICATION_CREDENTIALS"),
  adminTelegramId: process.env.ADMIN_TELEGRAM_ID ?? "",
  adminVkId: process.env.ADMIN_VK_ID ?? "",
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (this will only succeed once at least one file exists per include glob; since `src/config.ts` exists now, it should pass).

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "feat: add environment config loader"
```

---

## Task 3: Table Constants

**Files:**
- Create: `src/core/tables.ts`

- [ ] **Step 1: Create `src/core/tables.ts`**

```typescript
export interface Table {
  id: number;
  prefix: string;
}

export const TABLES: Table[] = [
  { id: 1, prefix: "Стол 1" },
  { id: 2, prefix: "Стол 2" },
  { id: 3, prefix: "Стол 3" },
];

export function getTableById(id: number): Table {
  const table = TABLES.find((t) => t.id === id);
  if (!table) {
    throw new Error(`Unknown table id: ${id}`);
  }
  return table;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/tables.ts
git commit -m "feat: add table constants"
```

---

## Task 4: Availability Calculation (TDD)

This is the most important piece of logic in the system — it decides which slots are shown to clients. Test it thoroughly before implementing.

**Files:**
- Create: `src/core/availability.ts`
- Test: `src/core/availability.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/core/availability.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { atHour, candidateStartHours, getFreeSlotStarts, isSlotFree } from "./availability";

describe("candidateStartHours", () => {
  it("returns every hour where a 4-hour slot fits between 10:00 and 22:00", () => {
    expect(candidateStartHours(10, 22, 4)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
  });

  it("returns an empty list when the window is shorter than the slot", () => {
    expect(candidateStartHours(10, 12, 4)).toEqual([]);
  });
});

describe("isSlotFree", () => {
  it("is free when there are no busy intervals", () => {
    const start = new Date(2026, 6, 20, 10, 0);
    const end = new Date(2026, 6, 20, 14, 0);
    expect(isSlotFree(start, end, [])).toBe(true);
  });

  it("is not free when a busy interval overlaps the middle of the slot", () => {
    const start = new Date(2026, 6, 20, 10, 0);
    const end = new Date(2026, 6, 20, 14, 0);
    const busy = [{ start: new Date(2026, 6, 20, 12, 0), end: new Date(2026, 6, 20, 13, 0) }];
    expect(isSlotFree(start, end, busy)).toBe(false);
  });

  it("is free when a busy interval ends exactly when the slot starts", () => {
    const start = new Date(2026, 6, 20, 14, 0);
    const end = new Date(2026, 6, 20, 18, 0);
    const busy = [{ start: new Date(2026, 6, 20, 10, 0), end: new Date(2026, 6, 20, 14, 0) }];
    expect(isSlotFree(start, end, busy)).toBe(true);
  });

  it("is free when a busy interval starts exactly when the slot ends", () => {
    const start = new Date(2026, 6, 20, 10, 0);
    const end = new Date(2026, 6, 20, 14, 0);
    const busy = [{ start: new Date(2026, 6, 20, 14, 0), end: new Date(2026, 6, 20, 18, 0) }];
    expect(isSlotFree(start, end, busy)).toBe(true);
  });
});

describe("getFreeSlotStarts", () => {
  const day = new Date(2026, 6, 20, 15, 30); // arbitrary time on the target day

  it("returns all 9 candidate starts when the day is fully free", () => {
    const starts = getFreeSlotStarts(day, []);
    expect(starts).toHaveLength(9);
    expect(starts[0]).toEqual(atHour(day, 10));
    expect(starts[8]).toEqual(atHour(day, 18));
  });

  it("returns no starts when the whole day is booked", () => {
    const busy = [{ start: atHour(day, 10), end: atHour(day, 22) }];
    expect(getFreeSlotStarts(day, busy)).toEqual([]);
  });

  it("excludes only the starts whose 4-hour window overlaps a 1-hour booking", () => {
    // Busy 12:00-13:00 overlaps windows starting at 10, 11, 12 (their ends are 14, 15, 16,
    // all after 12:00), but not 13:00 onward (13:00-17:00 starts exactly when the busy ends).
    const busy = [{ start: atHour(day, 12), end: atHour(day, 13) }];
    const starts = getFreeSlotStarts(day, busy);
    const hours = starts.map((s) => s.getHours());
    expect(hours).toEqual([13, 14, 15, 16, 17, 18]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/availability.test.ts`
Expected: FAIL — `Cannot find module './availability'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/core/availability.ts`:

```typescript
import { addHours, setHours, setMilliseconds, setMinutes, setSeconds, startOfDay } from "date-fns";

export const CLUB_OPEN_HOUR = 10;
export const CLUB_CLOSE_HOUR = 22;
export const SLOT_DURATION_HOURS = 4;

export interface BusyInterval {
  start: Date;
  end: Date;
}

export function candidateStartHours(
  openHour: number = CLUB_OPEN_HOUR,
  closeHour: number = CLUB_CLOSE_HOUR,
  durationHours: number = SLOT_DURATION_HOURS
): number[] {
  const hours: number[] = [];
  for (let h = openHour; h + durationHours <= closeHour; h++) {
    hours.push(h);
  }
  return hours;
}

export function atHour(date: Date, hour: number): Date {
  return setMilliseconds(setSeconds(setMinutes(setHours(startOfDay(date), hour), 0), 0), 0);
}

export function isSlotFree(start: Date, end: Date, busy: BusyInterval[]): boolean {
  return !busy.some((b) => start < b.end && end > b.start);
}

export function getFreeSlotStarts(
  date: Date,
  busy: BusyInterval[],
  opts: { openHour?: number; closeHour?: number; durationHours?: number } = {}
): Date[] {
  const openHour = opts.openHour ?? CLUB_OPEN_HOUR;
  const closeHour = opts.closeHour ?? CLUB_CLOSE_HOUR;
  const durationHours = opts.durationHours ?? SLOT_DURATION_HOURS;

  return candidateStartHours(openHour, closeHour, durationHours)
    .map((h) => atHour(date, h))
    .filter((start) => isSlotFree(start, addHours(start, durationHours), busy));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/availability.test.ts`
Expected: PASS, all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/availability.ts src/core/availability.test.ts
git commit -m "feat: add free-slot availability calculation"
```

---

## Task 5: Booking Metadata Encoding (TDD)

Each calendar event's `description` carries hidden metadata (platform, user id, username) so the bot can later recognize "my bookings". Test the encode/decode round-trip and its failure modes.

**Files:**
- Create: `src/core/booking-meta.ts`
- Test: `src/core/booking-meta.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/core/booking-meta.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { decodeDescription, encodeDescription, matchesUser } from "./booking-meta";

describe("encodeDescription / decodeDescription", () => {
  it("round-trips a valid meta object", () => {
    const meta = { platform: "telegram" as const, userId: "123", username: "ivan" };
    const description = encodeDescription(meta);
    expect(decodeDescription(description)).toEqual(meta);
  });

  it("returns null for undefined description", () => {
    expect(decodeDescription(undefined)).toBeNull();
  });

  it("returns null for null description", () => {
    expect(decodeDescription(null)).toBeNull();
  });

  it("returns null when the marker is missing", () => {
    expect(decodeDescription("just some random text")).toBeNull();
  });

  it("returns null when the JSON after the marker is malformed", () => {
    expect(decodeDescription("Забронировано через бота.\n---META---\n{not valid json")).toBeNull();
  });

  it("returns null when the parsed object is missing required fields", () => {
    expect(decodeDescription("---META---\n{\"platform\":\"telegram\"}")).toBeNull();
  });
});

describe("matchesUser", () => {
  const meta = { platform: "telegram" as const, userId: "123", username: "ivan" };

  it("matches same platform and userId", () => {
    expect(matchesUser(meta, "telegram", "123")).toBe(true);
  });

  it("does not match a different userId", () => {
    expect(matchesUser(meta, "telegram", "999")).toBe(false);
  });

  it("does not match a different platform", () => {
    expect(matchesUser(meta, "vk", "123")).toBe(false);
  });

  it("does not match null meta", () => {
    expect(matchesUser(null, "telegram", "123")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/core/booking-meta.test.ts`
Expected: FAIL — `Cannot find module './booking-meta'`.

- [ ] **Step 3: Write the implementation**

Create `src/core/booking-meta.ts`:

```typescript
export interface BookingMeta {
  platform: "telegram" | "vk";
  userId: string;
  username: string;
}

const META_MARKER = "---META---";
const DESCRIPTION_PREFIX = "Забронировано через бота.";

export function encodeDescription(meta: BookingMeta): string {
  return `${DESCRIPTION_PREFIX}\n${META_MARKER}\n${JSON.stringify(meta)}`;
}

export function decodeDescription(description: string | null | undefined): BookingMeta | null {
  if (!description) return null;
  const idx = description.indexOf(META_MARKER);
  if (idx === -1) return null;
  const jsonPart = description.slice(idx + META_MARKER.length).trim();
  try {
    const parsed = JSON.parse(jsonPart);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed.platform === "telegram" || parsed.platform === "vk") &&
      typeof parsed.userId === "string" &&
      typeof parsed.username === "string"
    ) {
      return parsed as BookingMeta;
    }
    return null;
  } catch {
    return null;
  }
}

export function matchesUser(
  meta: BookingMeta | null,
  platform: "telegram" | "vk",
  userId: string
): boolean {
  return meta !== null && meta.platform === platform && meta.userId === userId;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/core/booking-meta.test.ts`
Expected: PASS, all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/booking-meta.ts src/core/booking-meta.test.ts
git commit -m "feat: add booking metadata encode/decode"
```

---

## Task 6: Shared Types and Formatting Helpers

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/format.ts`

- [ ] **Step 1: Create `src/core/types.ts`**

```typescript
import { Table } from "./tables";

export interface Booking {
  eventId: string;
  table: Table;
  start: Date;
  end: Date;
  name: string;
}
```

- [ ] **Step 2: Create `src/core/format.ts`**

```typescript
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
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/core/types.ts src/core/format.ts
git commit -m "feat: add shared booking types and text formatting helpers"
```

---

## Task 7: Google Calendar Client

**Files:**
- Create: `src/core/calendar.ts`

- [ ] **Step 1: Create `src/core/calendar.ts`**

```typescript
import { calendar_v3, google } from "googleapis";

export interface CalendarEvent {
  id: string;
  summary: string;
  description: string | null;
  start: Date;
  end: Date;
}

export interface CalendarClient {
  listEvents(timeMin: Date, timeMax: Date): Promise<CalendarEvent[]>;
  createEvent(summary: string, description: string, start: Date, end: Date): Promise<string>;
  deleteEvent(eventId: string): Promise<void>;
}

export class GoogleCalendarClient implements CalendarClient {
  private readonly calendarPromise: Promise<calendar_v3.Calendar>;

  constructor(private readonly calendarId: string, credentialsPath: string) {
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ["https://www.googleapis.com/auth/calendar"],
    });
    this.calendarPromise = auth
      .getClient()
      .then((authClient) => google.calendar({ version: "v3", auth: authClient as never }));
  }

  async listEvents(timeMin: Date, timeMax: Date): Promise<CalendarEvent[]> {
    const calendar = await this.calendarPromise;
    const res = await calendar.events.list({
      calendarId: this.calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });
    return (res.data.items ?? [])
      .filter((item): item is calendar_v3.Schema$Event & { id: string } => !!item.id)
      .map((item) => ({
        id: item.id,
        summary: item.summary ?? "",
        description: item.description ?? null,
        start: new Date(item.start?.dateTime ?? item.start?.date ?? ""),
        end: new Date(item.end?.dateTime ?? item.end?.date ?? ""),
      }));
  }

  async createEvent(summary: string, description: string, start: Date, end: Date): Promise<string> {
    const calendar = await this.calendarPromise;
    const res = await calendar.events.insert({
      calendarId: this.calendarId,
      requestBody: {
        summary,
        description,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      },
    });
    if (!res.data.id) {
      throw new Error("Google Calendar did not return an event id");
    }
    return res.data.id;
  }

  async deleteEvent(eventId: string): Promise<void> {
    const calendar = await this.calendarPromise;
    await calendar.events.delete({ calendarId: this.calendarId, eventId });
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/calendar.ts
git commit -m "feat: add Google Calendar client wrapper"
```

---

## Task 8: Booking Service

Ties tables, availability, the calendar client, and metadata together into the operations the adapters need: get free slots, create a booking (re-checking availability), list a user's bookings, cancel a booking, and get the week's schedule for the admin.

**Files:**
- Create: `src/core/booking.ts`

- [ ] **Step 1: Create `src/core/booking.ts`**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/core/booking.ts
git commit -m "feat: add booking service tying availability, calendar and metadata together"
```

---

## Task 9: Telegram Keyboards

**Files:**
- Create: `src/adapters/telegram/keyboards.ts`

- [ ] **Step 1: Create `src/adapters/telegram/keyboards.ts`**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/adapters/telegram/keyboards.ts
git commit -m "feat: add Telegram keyboard builders"
```

---

## Task 10: Telegram Bot

Implements the full conversation: main menu, date/table/time selection, name entry, confirmation (with a fresh availability re-check), booking cancellation, and the admin `/schedule` command. Every handler that touches the calendar is wrapped in try/catch so calendar outages produce a friendly message instead of a crash.

**Files:**
- Create: `src/adapters/telegram/bot.ts`

- [ ] **Step 1: Create `src/adapters/telegram/bot.ts`**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/adapters/telegram/bot.ts
git commit -m "feat: implement Telegram booking conversation"
```

---

## Task 11: VK Keyboards

**Files:**
- Create: `src/adapters/vk/keyboards.ts`

- [ ] **Step 1: Create `src/adapters/vk/keyboards.ts`**

```typescript
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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/adapters/vk/keyboards.ts
git commit -m "feat: add VK keyboard builders"
```

---

## Task 12: VK Bot

Mirrors the Telegram conversation using vk-io: `message_new` handles text (`/start`, `/schedule`, and free-text name entry), `message_event` handles callback-button clicks.

**Files:**
- Create: `src/adapters/vk/bot.ts`

- [ ] **Step 1: Create `src/adapters/vk/bot.ts`**

```typescript
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
    await context.answer();

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
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. If `vk-io` types don't expose `.send()` on `MessageEventContext` in the installed version, replace those calls with `vk.api.messages.send({ peer_id: context.peerId, message: "...", random_id: Date.now(), keyboard: ... })` instead — check `node_modules/vk-io/dist/types/contexts/message-event.d.ts` for the exact available methods before making that change.

- [ ] **Step 3: Commit**

```bash
git add src/adapters/vk/bot.ts
git commit -m "feat: implement VK booking conversation"
```

---

## Task 13: Entry Point

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create `src/index.ts`**

```typescript
import { config } from "./config";
import { GoogleCalendarClient } from "./core/calendar";
import { BookingService } from "./core/booking";
import { createTelegramBot } from "./adapters/telegram/bot";
import { createVkBot } from "./adapters/vk/bot";

async function main() {
  const calendarClient = new GoogleCalendarClient(
    config.googleCalendarId,
    config.googleApplicationCredentials
  );
  const bookingService = new BookingService(calendarClient);

  const telegramBot = createTelegramBot(bookingService);
  const vkBot = createVkBot(bookingService);

  await Promise.all([telegramBot.start(), vkBot.updates.start()]);
}

main().catch((err) => {
  console.error("Fatal error on startup:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify the full project builds**

Run: `npm run build`
Expected: `dist/` directory created with compiled `.js` files, no TypeScript errors.

- [ ] **Step 3: Verify all unit tests still pass**

Run: `npm test`
Expected: PASS, all `availability.test.ts` and `booking-meta.test.ts` tests green.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire config, booking service and both adapters into entry point"
```

---

## Task 14: systemd Unit for Deployment

**Files:**
- Create: `deploy/club-bot.service`

- [ ] **Step 1: Create `deploy/club-bot.service`**

```ini
[Unit]
Description=Club table booking bot (Telegram + VK)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/club-bot
EnvironmentFile=/opt/club-bot/.env
Environment=TZ=Europe/Moscow
ExecStart=/usr/bin/node /opt/club-bot/dist/index.js
Restart=always
RestartSec=5
User=club-bot

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 2: Commit**

```bash
git add deploy/club-bot.service
git commit -m "chore: add systemd unit for VPS deployment"
```

---

## Task 15: README and Manual Verification Checklist

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# Club Table-Booking Bot

Telegram + VK bot that shows free 4-hour table slots (10:00–22:00, 3 tables) from a
shared Google Calendar, lets clients book and cancel their own slots, and lets an
admin view the week's schedule.

## Setup

### 1. Google Calendar Service Account

1. In Google Cloud Console, create a project (or reuse one) and enable the
   **Google Calendar API**.
2. Create a **Service Account**, then create a JSON key for it and download it as
   `service-account.json`.
3. Open the club's Google Calendar → Settings → "Share with specific people" →
   add the service account's email (looks like
   `xxx@yyy.iam.gserviceaccount.com`) with **"Make changes to events"** permission.
4. Copy the Calendar ID from Calendar Settings → "Integrate calendar" →
   "Calendar ID".

### 2. Bot tokens

- **Telegram**: create a bot via [@BotFather](https://t.me/BotFather), copy the token.
- **VK**: create a community, go to Manage → API usage → Access Tokens, create a
  token with `messages` scope.

### 3. Environment

```bash
cp .env.example .env
```

Fill in `.env`:

```
TELEGRAM_BOT_TOKEN=<from BotFather>
VK_TOKEN=<VK community token>
GOOGLE_CALENDAR_ID=<calendar id from step 1.4>
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
ADMIN_TELEGRAM_ID=<your Telegram numeric user id>
ADMIN_VK_ID=<your VK numeric user id>
```

Place the downloaded `service-account.json` in the project root.

### 4. Install, build, run locally

```bash
npm install
npm run build
npm start
```

For development with auto-reload on changes: `npm run dev`.

## Deployment (VPS, systemd)

```bash
sudo mkdir -p /opt/club-bot
sudo useradd -r -s /bin/false club-bot   # if the user doesn't exist yet
# copy the project (dist/, node_modules/, package.json, .env, service-account.json)
# into /opt/club-bot, owned by the club-bot user
sudo cp deploy/club-bot.service /etc/systemd/system/club-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now club-bot
sudo systemctl status club-bot
```

Adjust `Environment=TZ=Europe/Moscow` in `deploy/club-bot.service` if the club is
in a different timezone.

## Manual Verification Checklist

Automated tests only cover `src/core/availability.ts` and
`src/core/booking-meta.ts`. Everything else — the real Telegram/VK conversation
and Google Calendar integration — must be checked by hand against the running
bots before considering the feature done:

- [ ] `/start` in Telegram shows the main menu with "Забронировать стол" / "Мои брони".
- [ ] Same in VK.
- [ ] Booking flow: pick a date → pick a table → pick a free time → enter a name →
      confirm → event appears in Google Calendar with the correct title
      (`Стол N: Имя`) and correct start/end time.
- [ ] Booking a slot that's already fully booked for that table/date shows
      "На эту дату свободных окон нет." and offers to pick another date.
- [ ] Booking the same slot twice in quick succession from two different chats:
      the second confirmation shows "Это время уже заняли."
- [ ] "Мои брони" lists the booking just created, and cancelling it removes the
      event from Google Calendar.
- [ ] A booking made in Telegram does **not** show up in VK's "Мои брони" for a
      different account, and vice versa.
- [ ] `/schedule` from the configured admin account shows the week's bookings
      across all 3 tables, grouped by day.
- [ ] `/schedule` from a non-admin account does nothing.
- [ ] Temporarily revoking the service account's calendar access (or using a
      wrong `GOOGLE_CALENDAR_ID`) causes the bot to reply
      "Сервис временно недоступен, попробуйте позже." instead of crashing or
      hanging — check the process is still running afterward
      (`systemctl status club-bot` or the local process).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add setup, deployment and manual verification instructions"
```

---

## Self-Review Notes

- **Spec coverage:** architecture (core + adapters) — Tasks 1–13; Service Account
  auth — Task 7 + README; booking scenario (menu → date → table → time → name →
  confirm with re-check → create event with hidden metadata) — Tasks 8, 10, 12;
  "Мои брони" + cancel — Tasks 8, 10, 12; admin `/schedule` — Tasks 8, 10, 12;
  systemd deployment — Task 14; calendar-unavailable error message — wrapped
  into every calendar-touching handler in Tasks 10 and 12; unit tests scoped to
  `availability.ts` and `booking-meta.ts` only, rest verified manually — Task 15
  checklist.
- **Type consistency checked:** `Booking`, `Table`, `BookingMeta`, `CalendarEvent`,
  `CalendarClient` are defined once (Tasks 3, 6, 7, 5) and imported consistently
  by `booking.ts`, both adapters' keyboards, and both adapters' bot files — no
  renamed duplicates.
- **VK API risk flagged explicitly** in Task 12 Step 2 rather than hidden: the
  exact `MessageEventContext` send method depends on the installed `vk-io`
  version and must be checked against its type definitions if the build fails.
