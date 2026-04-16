import { NextResponse } from 'next/server';
import { runEmailAgentTriage } from '@/lib/services/emailTriage';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await runEmailAgentTriage();
    console.info(`[email:triage:run] created=${result.created} dismissed=${result.dismissed}`);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[email:triage:run]', err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
