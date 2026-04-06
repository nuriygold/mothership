import { NextResponse } from 'next/server';
import { fetchTodayCalendarEvents } from '@/lib/services/calendar';

export const dynamic = 'force-dynamic';

export async function GET() {
  const events = await fetchTodayCalendarEvents();
  return NextResponse.json({ events, configured: !!(process.env.GOOGLE_CLIENT_ID) });
}
