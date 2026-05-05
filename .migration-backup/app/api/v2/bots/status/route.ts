import { getBotStatuses } from '@/lib/bot-status';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const statuses = getBotStatuses();
    return Response.json(statuses);
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'BOT_STATUS_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to load bot statuses',
        },
      },
      { status: 500 }
    );
  }
}
