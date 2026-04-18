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
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Check for common migration-related errors
    if (errorMessage.includes('emailAgentTriage') || errorMessage.includes('EmailTriageBucket')) {
      return NextResponse.json({
        ok: false,
        error: 'Database migration required. Run: npm run migrate:deploy',
        details: errorMessage
      }, { status: 500 });
    }

    return NextResponse.json({ ok: false, error: errorMessage }, { status: 500 });
  }
}
