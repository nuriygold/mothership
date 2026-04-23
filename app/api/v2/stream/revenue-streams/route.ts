import { sseResponse } from '@/lib/v2/event-bus';

export const dynamic = 'force-dynamic';

export async function GET() {
  return sseResponse('revenue-streams');
}
