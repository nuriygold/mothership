import { NextResponse } from 'next/server';
import { fetchTodayCalendarEvents, isCalendarConfigured } from '@/lib/services/calendar';

export const dynamic = 'force-dynamic';

export async function GET() {
  const configured = isCalendarConfigured();
  const { events, error } = await fetchTodayCalendarEvents();
  return NextResponse.json({ events, configured, ...(error ? { error } : {}) });
}
