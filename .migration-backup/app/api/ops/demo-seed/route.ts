import { NextResponse } from 'next/server';
import { resetDemoMissions, seedDemoMissions } from '@/lib/ops/service';
import { requireOpsAuth } from '@/lib/ops/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/ops/demo-seed — load three demo missions (Adrian RUNNING, Marvin
// BLOCKED, Iceman COMPLETED) so the /ops surface has compelling content for
// recordings or first-look demos. Idempotent: replaces any prior demo seed.
export async function POST() {
  const auth = await requireOpsAuth();
  if (!auth.ok) return auth.response;
  const result = await seedDemoMissions();
  return NextResponse.json({ ok: true, ...result });
}

// DELETE /api/ops/demo-seed — remove only demo-marked missions, leaving real
// dispatched missions intact.
export async function DELETE() {
  const auth = await requireOpsAuth();
  if (!auth.ok) return auth.response;
  const result = await resetDemoMissions();
  return NextResponse.json({ ok: true, ...result });
}
