import { NextResponse } from 'next/server';
import { fetchTodayCalendarEvents, isCalendarConfigured } from '@/lib/services/calendar';

/**
 * GET /api/v2/calendar/events
 *
 * Fields accessed by today/page.tsx (CalendarTimelineItem shape):
 *   events[].id, .title, .startTime, .endTime, .startDate, .status,
 *   .meetingUrl, .location
 *
 * configured: declared in SWR type but not directly read in page.tsx.
 * Returned for completeness and for ThreeDayGrid awareness.
 */
export async function GET() {
  const configured = isCalendarConfigured();

  if (!configured) {
    return NextResponse.json({ events: [], configured: false });
  }

  const { events, error } = await fetchTodayCalendarEvents();

  if (error) {
    console.error(
      JSON.stringify({
        route: 'GET /api/v2/calendar/events',
        error,
        timestamp: new Date().toISOString(),
      })
    );
    // Return empty rather than 500 — the FE gracefully falls back to []
    return NextResponse.json({ events: [], configured: true });
  }

  return NextResponse.json({ events, configured: true });
}
