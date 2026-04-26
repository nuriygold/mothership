import { NextResponse } from 'next/server';
import { applyControl } from '@/lib/ops/store';
import type { CampaignControlAction } from '@/lib/ops/types';

export const dynamic = 'force-dynamic';

const VALID: CampaignControlAction[] = ['resume', 'force_retry', 'approve_action', 'escalate', 'kill'];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const action = String(body?.action ?? '') as CampaignControlAction;
    if (!VALID.includes(action)) {
      return NextResponse.json(
        { ok: false, message: `Unknown action. Expected one of ${VALID.join(', ')}` },
        { status: 400 }
      );
    }
    const campaign = applyControl(params.id, action);
    if (!campaign) {
      return NextResponse.json({ ok: false, message: 'Campaign not found' }, { status: 404 });
    }
    return NextResponse.json({ campaign });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Control action failed' },
      { status: 500 }
    );
  }
}
