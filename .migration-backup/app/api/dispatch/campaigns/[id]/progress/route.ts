import { NextResponse } from 'next/server';
import { getDispatchCampaignProgress } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    const progress = await getDispatchCampaignProgress(params.id);
    return NextResponse.json(progress);
  } catch (error) {
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
