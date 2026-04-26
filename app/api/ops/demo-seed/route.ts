import { NextResponse } from 'next/server';
import { resetDemoMissions, seedDemoMissions } from '@/lib/ops/store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// POST /api/ops/demo-seed — load three demo missions (Adrian RUNNING, Marvin
// BLOCKED, Iceman COMPLETED) so the /ops surface has compelling content for
// recordings or first-look demos. Idempotent: replaces any prior demo seed.
export async function POST() {
  const result = seedDemoMissions();
  return NextResponse.json({ ok: true, ...result });
}

// DELETE /api/ops/demo-seed — remove the demo missions, leaving any real
// dispatched missions intact. Demo missions are identified by name prefix.
export async function DELETE() {
  const result = resetDemoMissions();
  return NextResponse.json({ ok: true, ...result });
}
