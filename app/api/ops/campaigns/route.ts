// /api/ops/campaigns
//
// GET   — list campaigns + ticker summary (mirrors workflow state from the
//         in-memory registry; the workflow itself is the source of truth).
// POST  — dispatch a new mission. This calls into the runtime adapter,
//         which starts a durable WDK workflow run and links its runId to
//         the campaign so control actions can find it later.

import { NextResponse } from 'next/server';
import { getTickerSummary, listCampaigns } from '@/lib/ops/store';
import { dispatchMission } from '@/lib/ops/runtime';
import type { ExecutionMode } from '@/lib/ops/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    campaigns: listCampaigns(),
    ticker: getTickerSummary(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = String(body?.name ?? '').trim();
    const objective = String(body?.objective ?? '').trim();
    const leadAgentId = String(body?.leadAgentId ?? '').trim();
    const executionMode: ExecutionMode =
      body?.executionMode === 'AGGRESSIVE' ? 'AGGRESSIVE' : 'STANDARD';
    const minimumBatchSize = Number.isFinite(Number(body?.minimumBatchSize))
      ? Math.max(1, Math.floor(Number(body.minimumBatchSize)))
      : 5;
    const requiredArtifacts = Array.isArray(body?.requiredArtifacts)
      ? body.requiredArtifacts.map((s: unknown) => String(s)).filter(Boolean)
      : [];

    if (!name || !objective || !leadAgentId) {
      return NextResponse.json(
        { ok: false, message: 'name, objective, and leadAgentId are required' },
        { status: 400 }
      );
    }

    const campaign = await dispatchMission({
      name,
      objective,
      leadAgentId,
      requiredArtifacts,
      minimumBatchSize,
      executionMode,
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : 'Failed to dispatch mission',
      },
      { status: 500 }
    );
  }
}
