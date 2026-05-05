import { NextResponse } from 'next/server';
import { approveDispatchPlan } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const campaign = await approveDispatchPlan(
      params.id,
      body?.planName ? String(body.planName) : undefined
    );
    return NextResponse.json({ campaign });
  } catch (error) {
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
