import { NextResponse } from 'next/server';
import { getSystemRules, updateSystemRules } from '@/lib/ops/store';
import type { SystemRules } from '@/lib/ops/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ rules: getSystemRules() });
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Partial<SystemRules>;
    const patch: Partial<SystemRules> = {};
    if (typeof body.executionMode === 'boolean') patch.executionMode = body.executionMode;
    if (typeof body.fallbackEnforcement === 'boolean') patch.fallbackEnforcement = body.fallbackEnforcement;
    if (typeof body.batchMinimum === 'number' && Number.isFinite(body.batchMinimum)) {
      patch.batchMinimum = Math.max(1, Math.floor(body.batchMinimum));
    }
    if (typeof body.watchdogIntervalMinutes === 'number' && Number.isFinite(body.watchdogIntervalMinutes)) {
      patch.watchdogIntervalMinutes = Math.max(1, Math.floor(body.watchdogIntervalMinutes));
    }
    if (typeof body.blockerThreshold === 'number' && Number.isFinite(body.blockerThreshold)) {
      patch.blockerThreshold = Math.max(1, Math.floor(body.blockerThreshold));
    }
    return NextResponse.json({ rules: updateSystemRules(patch) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to update rules' },
      { status: 500 }
    );
  }
}
