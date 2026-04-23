import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAuditEvent } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

/**
 * Awards a daily-anchor trophy for a given day (YYYY-MM-DD in ET).
 * Idempotent — a second call for the same day is a no-op, so the client
 * can fire-and-forget whenever the 6th anchor flips to complete.
 */
export async function POST(req: Request) {
  let body: { date?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — we'll default to today in ET
  }

  const date = (body.date ?? new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ ok: false, error: 'Invalid date — expected YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const existing = await prisma.auditEvent.findFirst({
      where: { entityType: 'WellnessAnchor', eventType: 'COMPLETED', entityId: date },
      select: { id: true, createdAt: true },
    });
    if (existing) {
      return NextResponse.json({ ok: true, alreadyAwarded: true, awardedAt: existing.createdAt.toISOString() });
    }

    const event = await createAuditEvent({
      entityType: 'WellnessAnchor',
      entityId: date,
      eventType: 'COMPLETED',
      actorId: 'self',
      metadata: { description: 'All six daily anchors complete', category: 'Wellness' },
    });

    return NextResponse.json({ ok: true, alreadyAwarded: false, id: event.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown database error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
