import { NextResponse } from 'next/server';
import { recommendBotForCampaign } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const recommendation = await recommendBotForCampaign(params.id);
    return NextResponse.json(recommendation);
  } catch (error) {
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
