import { NextResponse } from 'next/server';
import { escalateAllBlockers, forceResumeAll, getWatchdogState } from '@/lib/ops/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getWatchdogState());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = String(body?.action ?? '');
    if (action === 'force_resume_all') {
      const count = forceResumeAll();
      return NextResponse.json({ ok: true, action, count });
    }
    if (action === 'escalate_all') {
      const count = escalateAllBlockers();
      return NextResponse.json({ ok: true, action, count });
    }
    return NextResponse.json({ ok: false, message: 'Unknown watchdog action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Watchdog action failed' },
      { status: 500 }
    );
  }
}
