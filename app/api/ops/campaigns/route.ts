import { NextResponse } from 'next/server';
import { createCampaign, getTickerSummary, listCampaigns } from '@/lib/ops/store';
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
    const executionMode: ExecutionMode = body?.executionMode === 'AGGRESSIVE' ? 'AGGRESSIVE' : 'STANDARD';
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

    const campaign = createCampaign({
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
      { ok: false, message: error instanceof Error ? error.message : 'Failed to dispatch campaign' },
      { status: 500 }
    );
  }
}
