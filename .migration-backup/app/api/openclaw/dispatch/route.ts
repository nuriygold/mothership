import { NextResponse } from 'next/server';
import { dispatchToOpenClaw } from '@/lib/services/openclaw';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const text = String(body?.text ?? '').trim();
    const agentId = body?.agentId ? String(body.agentId) : undefined;
    const sessionKey = body?.sessionKey ? String(body.sessionKey) : undefined;

    if (!text) {
      return NextResponse.json({ ok: false, message: 'Text is required' }, { status: 400 });
    }

    const result = await dispatchToOpenClaw({ text, agentId, sessionKey });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json({ ok: false, message: 'Dispatch failed', error: String(error) }, { status: 500 });
  }
}
