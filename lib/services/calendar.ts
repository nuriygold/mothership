import { google } from 'googleapis';

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string; // "9:00 AM"
  endTime: string | null;
  startDate: string; // ISO
  isAllDay: boolean;
  status: 'done' | 'current' | 'upcoming';
}

function isCalendarConfigured(): boolean {
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
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export async function fetchTodayCalendarEvents(): Promise<CalendarEvent[]> {
  if (!isCalendarConfigured()) {
    return [];
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

    // Fetch events from start of today through end of today
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const res = await cal.events.list({
      calendarId,
      timeMin: todayStart.toISOString(),
      timeMax: todayEnd.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    });

    const items = res.data.items ?? [];

    return items
      .filter((ev) => !!ev.summary) // skip untitled events
      .map((ev) => {
        const isAllDay = !ev.start?.dateTime;
        const startIso = ev.start?.dateTime ?? ev.start?.date ?? now.toISOString();
        const endIso = ev.end?.dateTime ?? ev.end?.date ?? null;

        return {
          id: ev.id ?? Math.random().toString(36).slice(2),
          title: ev.summary ?? 'Untitled event',
          startTime: isAllDay ? 'All day' : fmtTime(startIso),
          endTime: endIso && !isAllDay ? fmtTime(endIso) : null,
          startDate: startIso,
          isAllDay,
          status: isAllDay ? 'upcoming' : computeStatus(startIso, endIso, now),
        };
      });
  } catch (err) {
    console.error(
      JSON.stringify({
        service: 'calendar',
        event: 'fetch_failed',
        message: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      })
    );
    return [];
  }
}
