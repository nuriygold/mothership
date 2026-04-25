import { NextResponse } from 'next/server';
import { getCampaignFeed } from '@/lib/ops/store';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return NextResponse.json({ events: getCampaignFeed(params.id) });
}
