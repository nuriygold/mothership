import { NextResponse } from 'next/server';
import { parseDispatchPlanEnvelope, saveDispatchPlanEnvelope } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawJson = String(body?.rawJson ?? body?.text ?? '').trim();

    if (!rawJson) {
      return NextResponse.json({ ok: false, message: 'rawJson is required' }, { status: 400 });
    }

    const parsed = parseDispatchPlanEnvelope(rawJson);
    if (!parsed) {
      return NextResponse.json(
        { ok: false, message: 'Could not parse a plan envelope from the provided JSON' },
        { status: 400 }
      );
    }

    const result = await saveDispatchPlanEnvelope(params.id, parsed, 'manual-json');
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
