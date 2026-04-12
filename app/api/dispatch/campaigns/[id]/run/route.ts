import { NextResponse } from 'next/server';
import {
  enqueueDispatchCampaign,
  runDispatchCampaign,
  scheduleDispatchCampaign,
} from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode: 'now' | 'queue' | 'schedule' = body?.mode ?? 'now';

    if (mode === 'queue') {
      const campaign = await enqueueDispatchCampaign(params.id);
      return NextResponse.json({ campaign });
    }

    if (mode === 'schedule') {
      const raw = body?.scheduledAt;
      const scheduledAt = raw ? new Date(raw) : null;
      if (!scheduledAt || isNaN(scheduledAt.getTime())) {
        return NextResponse.json(
          { ok: false, message: 'scheduledAt (ISO string) is required for schedule mode' },
          { status: 400 }
        );
      }
      const campaign = await scheduleDispatchCampaign(params.id, scheduledAt);
      return NextResponse.json({ campaign });
    }

    // mode === 'now': fire-and-forget so the HTTP response returns immediately
    runDispatchCampaign(params.id).catch((err: unknown) => {
      console.error(`[dispatch] Campaign ${params.id} run failed:`, err);
    });

    return NextResponse.json({ ok: true, status: 'EXECUTING', message: 'Campaign execution started' });
  } catch (error) {
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
