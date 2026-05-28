import { NextResponse } from 'next/server';
import { getV2BotsFeed } from '@/lib/v2/orchestrator';

/**
 * GET /api/v2/bots
 *
 * Fields accessed by bots/page.tsx (V2BotsFeed -> V2BotProfile[]):
 *   identity.name, .role, .colorKey, .iconKey
 *   liveState.status, .currentTask
 *   throughputMetrics.completed, .queued, .blocked
 *   recentOutputs[].title, .timestamp  (.type is not rendered)
 *   staticProfile.workingStyle, .personality, .strengths[]
 */
export async function GET() {
  try {
    const feed = await getV2BotsFeed();
    return NextResponse.json(feed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ route: 'GET /api/v2/bots', error: message, timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: { code: 'internal', message } }, { status: 500 });
  }
}
