import { NextResponse } from 'next/server';
import { generateDispatchPlans } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const result = await generateDispatchPlans(params.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
