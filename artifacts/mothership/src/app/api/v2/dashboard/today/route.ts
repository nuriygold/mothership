import { NextResponse } from 'next/server';
import { getV2TodayFeed } from '@/lib/v2/orchestrator';

/**
 * GET /api/v2/dashboard/today
 *
 * Fields accessed by today/page.tsx:
 *   userContext.greeting, userContext.userName
 *   timeline[].taskId, .title, .status, .iconType, .startDate, .type, .time
 *
 * affirmation / affirmationSource are defined on V2TodayFeed but the FE
 * ignores them and calls pickRandomAffirmationBar() locally instead.
 */
export async function GET() {
  try {
    const feed = await getV2TodayFeed();
    return NextResponse.json(feed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ route: 'GET /api/v2/dashboard/today', error: message, timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: { code: 'internal', message } }, { status: 500 });
  }
}
