import { NextResponse } from 'next/server';
import { getCampaign, listAgents } from '@/lib/ops/service';
import { requireOpsAuth } from '@/lib/ops/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireOpsAuth();
  if (!auth.ok) return auth.response;
  const [campaign, agents] = await Promise.all([getCampaign(params.id), listAgents()]);
  if (!campaign) {
    return NextResponse.json({ ok: false, message: 'Campaign not found' }, { status: 404 });
  }
  const leadAgent = agents.find((a) => a.id === campaign.leadAgentId) ?? null;
  return NextResponse.json({ campaign, leadAgent });
}
