import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { processDispatchQueue } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret') ?? new URL(req.url).searchParams.get('secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  waitUntil(
    processDispatchQueue()
      .then(({ processed, skipped }) => {
        console.info(`[dispatch:worker] processed=${processed} skipped=${skipped}`);
      })
      .catch((err: unknown) => {
        console.error('[dispatch:worker] queue processing failed:', err);
      })
  );

  return NextResponse.json({ ok: true, message: 'Worker triggered' });
}
