import { NextResponse } from 'next/server';
import { getDispatchCampaign } from '@/lib/services/dispatch';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const campaign = await getDispatchCampaign(params.id);
  if (!campaign) {
    return NextResponse.json({ ok: false, message: 'Campaign not found' }, { status: 404 });
  }

  return NextResponse.json(campaign);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const reason: string = String(body?.reason ?? '').trim();
  const scope: 'campaign' | 'tasks' = body?.scope === 'tasks' ? 'tasks' : 'campaign';

  if (!reason) {
    return NextResponse.json({ ok: false, message: 'Reason is required' }, { status: 400 });
  }

  const campaign = await getDispatchCampaign(params.id);
  if (!campaign) {
    return NextResponse.json({ ok: false, message: 'Campaign not found' }, { status: 404 });
  }

  if (scope === 'campaign') {
    await prisma.dispatchCampaign.delete({ where: { id: params.id } });
  } else {
    await prisma.dispatchTask.updateMany({
      where: { campaignId: params.id },
      data: { status: 'CANCELED' },
    });
  }

  console.log(JSON.stringify({
    event: 'dispatch_trash',
    campaignId: params.id,
    campaignTitle: campaign.title,
    scope,
    reason,
    trashedAt: new Date().toISOString(),
  }));

  return NextResponse.json({ ok: true, scope, reason });
}
