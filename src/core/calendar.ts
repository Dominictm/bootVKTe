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
