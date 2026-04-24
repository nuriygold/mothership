import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { revenueStreamStatusLogs, revenueStreamStatuses } from '@/lib/db/schema';
import { getStreamDefs, readSnapshot } from '@/lib/v2/revenue-streams-server';
import { ensureV2Authorized } from '@/lib/v2/auth';
import { publishV2Event } from '@/lib/v2/event-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const [defs, rows] = await Promise.all([
    getStreamDefs(),
    db.select().from(revenueStreamStatuses),
  ]);

  const statusMap = new Map(rows.map((r) => [r.stream, r]));

  const streams = await Promise.all(
    defs.map(async (def) => {
      const row = statusMap.get(def.key);
      const snap = await readSnapshot(def.folderName);
      return {
        key: def.key,
        displayName: def.displayName,
        leadBotKey: def.leadBotKey,
        leadDisplay: def.leadDisplay,
        // DB status takes priority; fall back to snapshot; then 'unknown'
        status: row?.status ?? snap.status ?? 'unknown',
        // DB note takes priority; fall back to snapshot note
        note: row?.note ?? snap.note ?? null,
        requestedAt: row?.requestedAt?.toISOString() ?? null,
        lastReportAt: row?.lastReportAt?.toISOString() ?? null,
        lastReport: row?.lastReport ?? null,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
        // Live snapshot fields
        mtd: snap.mtd ?? null,
        ytd: snap.ytd ?? null,
        snapshotUpdated: snap.updated ?? null,
      };
    })
  );

  return NextResponse.json({ streams });
}

// Agent POST: update status + note, clear requestedAt, append log
export async function POST(req: Request) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  const body = await req.json();
  const stream = String(body?.stream ?? '').toLowerCase().trim();
  const status = String(body?.status ?? '').trim();
  const note = body?.note != null ? String(body.note).trim() : undefined;

  if (!stream || !status) {
    return NextResponse.json({ error: 'stream and status are required' }, { status: 400 });
  }

  const [row] = await db
    .insert(revenueStreamStatuses)
    .values({ stream, status, note: note ?? null, requestedAt: null })
    .onConflictDoUpdate({
      target: revenueStreamStatuses.stream,
      set: {
        status,
        ...(note !== undefined ? { note } : {}),
        requestedAt: null,
        updatedAt: new Date(),
      },
    })
    .returning();

  await db.insert(revenueStreamStatusLogs).values({
    stream,
    status,
    note: note ?? null,
    action: 'agent-update',
  });

  publishV2Event('revenue-streams', 'status', { stream, status, note: row.note });

  return NextResponse.json({ ok: true, stream: row.stream, status: row.status });
}

// UI PATCH: ping lead — sets requestedAt to now
export async function PATCH(req: Request) {
  const body = await req.json();
  const stream = String(body?.stream ?? '').toLowerCase().trim();

  if (!stream) {
    return NextResponse.json({ error: 'stream is required' }, { status: 400 });
  }

  const requestedAt = new Date();
  const [row] = await db
    .insert(revenueStreamStatuses)
    .values({ stream, status: 'unknown', requestedAt })
    .onConflictDoUpdate({
      target: revenueStreamStatuses.stream,
      set: { requestedAt, updatedAt: requestedAt },
    })
    .returning();

  await db.insert(revenueStreamStatusLogs).values({
    stream,
    status: row.status,
    action: 'ping',
  });

  publishV2Event('revenue-streams', 'status', {
    stream,
    status: row.status,
    requestedAt: row.requestedAt?.toISOString(),
  });

  return NextResponse.json({ ok: true, requestedAt: row.requestedAt?.toISOString() });
}
