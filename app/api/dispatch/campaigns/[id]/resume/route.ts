import { NextResponse } from 'next/server';
import { DispatchCampaignStatus } from '@/lib/db/prisma-types';
import { setDispatchCampaignStatus } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const campaign = await setDispatchCampaignStatus(params.id, DispatchCampaignStatus.EXECUTING);
    return NextResponse.json({ campaign });
  } catch (error) {
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
