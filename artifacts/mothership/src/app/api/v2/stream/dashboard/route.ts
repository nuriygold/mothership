import { sseResponse } from '@/lib/v2/event-bus';

/**
 * GET /api/v2/stream/dashboard
 *
 * SSE stream. Event types consumed by today/page.tsx:
 *   'connected'        — sets streamStatus = 'live'; no data fields read
 *   'approval.updated' — triggers mutate() + mutateTasks(); no data fields read
 *
 * The event bus emits 'connected' immediately on subscription and a
 * 'heartbeat' every 15 s. Backend code that approves tasks should call:
 *   publishV2Event('dashboard', 'approval.updated', {})
 */
export async function GET() {
  return sseResponse('dashboard');
}
