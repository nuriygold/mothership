// /api/ops/campaigns/[id]/control
//
// Operator control actions. Goes through the runtime adapter so kill
// actions translate into `world.events.create({ eventType: 'run_cancelled' })`
// against the durable workflow run. Other actions update local mirror
// state for now; resume/approve will be wired to workflow hooks in a
// follow-up slice.

import { NextResponse } from 'next/server';
import { controlMission } from '@/lib/ops/runtime';
import type { CampaignControlAction } from '@/lib/ops/types';

export const dynamic = 'force-dynamic';

const VALID: CampaignControlAction[] = [
  'resume',
  'force_retry',
  'approve_action',
  'escalate',
  'kill',
];

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const action = String(body?.action ?? '') as CampaignControlAction;
    if (!VALID.includes(action)) {
      return NextResponse.json(
        { ok: false, message: `Unknown action. Expected one of ${VALID.join(', ')}` },
        { status: 400 }
      );
    }
    const campaign = await controlMission(params.id, action);
    if (!campaign) {
      return NextResponse.json(
        { ok: false, message: 'Campaign not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ campaign });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : 'Control action failed',
      },
      { status: 500 }
    );
  }
}
