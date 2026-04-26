import { NextResponse } from 'next/server';
import { getCampaignFeed } from '@/lib/ops/store';
import { requireOpsAuth } from '@/lib/ops/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireOpsAuth();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ events: getCampaignFeed(params.id) });
}
