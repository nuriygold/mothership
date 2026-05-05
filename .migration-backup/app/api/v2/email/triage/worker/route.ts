import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { runEmailAgentTriage } from '@/lib/services/emailTriage';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret =
    req.headers.get('x-cron-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    new URL(req.url).searchParams.get('secret');

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 });
  }

  waitUntil(
    runEmailAgentTriage()
      .then(({ created, dismissed }) => {
        console.info(`[email:triage:worker] created=${created} dismissed=${dismissed}`);
      })
      .catch((err: unknown) => {
        console.error('[email:triage:worker] failed:', err);
      })
  );

  return NextResponse.json({ ok: true, message: 'Email triage triggered' });
}
