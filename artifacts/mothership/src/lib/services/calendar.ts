import { google } from 'googleapis';

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // "9:00 AM"
  endTime: string | null;
  startDate: string; // ISO
  endDate: string | null; // ISO
  isAllDay: boolean;
  status: 'done' | 'current' | 'upcoming';
  meetingUrl: string | null;
  location: string | null;
  description: string | null;
  htmlLink: string | null; // Google Calendar event URL for viewing/editing
}

export function isCalendarConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
}

function getCalendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID || 'primary';
}

function computeStatus(startIso: string, endIso: string | null, now: Date): CalendarEvent['status'] {
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : new Date(start.getTime() + 60 * 60 * 1000);
  if (now > end) return 'done';
  if (now >= start && now <= end) return 'current';
  return 'upcoming';
}

function fmtTime(iso: string): string {
  const tz = process.env.APP_TIMEZONE || 'America/New_York';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
}

export async function createCalendarEvent(input: {
  title: string;
  description?: string;
  startDateTime: string;
  endDateTime?: string;
  location?: string;
}): Promise<{ id: string; htmlLink?: string; error?: string }> {
  if (!isCalendarConfigured()) {
    return { id: '', error: 'Google Calendar not configured.' };
  }
  try {
    const oauth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const cal = google.calendar({ version: 'v3', auth: oauth });
    const calendarId = getCalendarId();
    const start = new Date(input.startDateTime);
    const end = input.endDateTime
      ? new Date(input.endDateTime)
      : new Date(start.getTime() + 60 * 60 * 1000);
    const res = await cal.events.insert({
      calendarId,
      requestBody: {
        summary: input.title,
        description: input.description,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
        location: input.location,
      },
    });
    return { id: res.data.id ?? '', htmlLink: res.data.htmlLink ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id: '', error: message };
  }
}

export async function fetchTodayCalendarEvents(): Promise<{ events: CalendarEvent[]; error?: string }> {
  if (!isCalendarConfigured()) {
    const missing = [
      !process.env.GOOGLE_CLIENT_ID && 'GOOGLE_CLIENT_ID',
      !process.env.GOOGLE_CLIENT_SECRET && 'GOOGLE_CLIENT_SECRET',
      !process.env.GOOGLE_REFRESH_TOKEN && 'GOOGLE_REFRESH_TOKEN',
    ].filter(Boolean);
    return { events: [], error: `Missing env vars: ${missing.join(", ")}` };
  }

  try {
    const oauth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const cal = google.calendar({ version: 'v3', auth: oauth });
    const calendarId = getCalendarId();
    const now = new Date();
    const tz = process.env.APP_TIMEZONE || 'America/New_York';

    // Fetch events from yesterday through 2 days from now (3-day window centered on today)
    const localDateStr = now.toLocaleDateString('en-CA', { timeZone: tz });
    const todayStart = new Date(localDateStr + 'T00:00:00');
    const windowStart = new Date(todayStart); windowStart.setDate(windowStart.getDate() - 1);
    const windowEnd = new Date(todayStart); windowEnd.setDate(windowEnd.getDate() + 2); windowEnd.setSeconds(windowEnd.getSeconds() - 1);

    const res = await cal.events.list({
      calendarId,
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    const items = res.data.items ?? [];

    const events = items
      .filter((ev) => !!ev.summary) // skip untitled events
      .map((ev) => {
        const isAllDay = !ev.start?.dateTime;
        const startIso = ev.start?.dateTime ?? ev.start?.date ?? now.toISOString();
        const endIso = ev.end?.dateTime ?? ev.end?.date ?? null;

        const meetingUrl =
          ev.hangoutLink ??
          ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ??
          null;

        return {
          id: ev.id ?? Math.random().toString(36).slice(2),
          title: ev.summary ?? 'Untitled event',
          startTime: isAllDay ? 'All day' : fmtTime(startIso),
          endTime: endIso && !isAllDay ? fmtTime(endIso) : null,
          startDate: startIso,
          endDate: endIso,
          isAllDay,
          status: isAllDay ? 'upcoming' : computeStatus(startIso, endIso, now),
          meetingUrl,
          location: ev.location ?? null,
          description: ev.description ?? null,
          htmlLink: ev.htmlLink ?? null,
        };
      });
    return { events };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        service: 'calendar',
        event: 'fetch_failed',
        message,
        timestamp: new Date().toISOString(),
      })
    );
    return { events: [], error: message };
  }
}
