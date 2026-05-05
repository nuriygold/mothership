import { NextResponse } from 'next/server';
import { escalateAllBlockers, forceResumeAll, getWatchdogState } from '@/lib/ops/store';
import { requireOpsAuth } from '@/lib/ops/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireOpsAuth();
  if (!auth.ok) return auth.response;
  return NextResponse.json(getWatchdogState());
}

export async function POST(req: Request) {
  const auth = await requireOpsAuth();
  if (!auth.ok) return auth.response;
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
