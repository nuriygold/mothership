import { NextResponse } from 'next/server';
import { getDispatchCampaign } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const campaign = await getDispatchCampaign(params.id);
  if (!campaign) {
    return NextResponse.json({ ok: false, message: 'Campaign not found' }, { status: 404 });
  }

  return NextResponse.json(campaign);
}
