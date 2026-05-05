import { NextResponse } from 'next/server';
import { DispatchCampaignStatus } from '@/lib/db/enums';
import { setDispatchCampaignStatus } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const campaign = await setDispatchCampaignStatus(params.id, DispatchCampaignStatus.PAUSED);
    return NextResponse.json({ campaign });
  } catch (error) {
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
