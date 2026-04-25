import { NextResponse } from 'next/server';
import { getCampaign, listAgents } from '@/lib/ops/store';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const campaign = getCampaign(params.id);
  if (!campaign) {
    return NextResponse.json({ ok: false, message: 'Campaign not found' }, { status: 404 });
  }
  const agents = listAgents();
  const leadAgent = agents.find((a) => a.id === campaign.leadAgentId) ?? null;
  return NextResponse.json({ campaign, leadAgent });
}
