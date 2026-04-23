import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { REVENUE_STREAMS } from '@/lib/v2/revenue-streams';
import { ensureV2Authorized } from '@/lib/v2/auth';
import { publishV2Event } from '@/lib/v2/event-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const rows = await prisma.revenueStreamStatus.findMany();
  const statusMap = new Map(rows.map((r) => [r.stream, r]));

  const streams = REVENUE_STREAMS.map((def) => {
    const row = statusMap.get(def.key);
    return {
      key: def.key,
      displayName: def.displayName,
      leadBotKey: def.leadBotKey,
      leadDisplay: def.leadDisplay,
      status: row?.status ?? 'unknown',
      note: row?.note ?? null,
      requestedAt: row?.requestedAt?.toISOString() ?? null,
      lastReportAt: row?.lastReportAt?.toISOString() ?? null,
      lastReport: row?.lastReport ?? null,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  });

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

  const row = await prisma.revenueStreamStatus.upsert({
    where: { stream },
    create: { stream, status, note: note ?? null, requestedAt: null },
    update: { status, ...(note !== undefined ? { note } : {}), requestedAt: null },
  });

  await prisma.revenueStreamStatusLog.create({
    data: { stream, status, note: note ?? null, action: 'agent-update' },
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

  const row = await prisma.revenueStreamStatus.upsert({
    where: { stream },
    create: { stream, status: 'unknown', requestedAt: new Date() },
    update: { requestedAt: new Date() },
  });

  await prisma.revenueStreamStatusLog.create({
    data: { stream, status: row.status, action: 'ping' },
  });

  publishV2Event('revenue-streams', 'status', {
    stream,
    status: row.status,
    requestedAt: row.requestedAt?.toISOString(),
  });

  return NextResponse.json({ ok: true, requestedAt: row.requestedAt?.toISOString() });
}
