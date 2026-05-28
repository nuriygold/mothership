import { sseResponse } from '@/lib/v2/event-bus';

/**
 * GET /api/v2/stream/bots
 *
 * SSE stream. Event types consumed by bots/page.tsx:
 *   'connected'    — sets streamStatus = 'live'; no data fields read
 *   'task.routed'  — triggers mutate(); no data fields read
 *
 * Backend code that routes a task to a bot should call:
 *   publishV2Event('bots', 'task.routed', { taskId, botKey })
 */
export async function GET() {
  return sseResponse('bots');
}
