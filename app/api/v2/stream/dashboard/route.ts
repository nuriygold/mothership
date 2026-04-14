import { sseResponse } from '@/lib/v2/event-bus';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return sseResponse('dashboard');
}

