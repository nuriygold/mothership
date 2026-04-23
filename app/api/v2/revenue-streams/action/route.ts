import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { REVENUE_STREAMS, streamByKey } from '@/lib/v2/revenue-streams';
import { agentForKey, dispatchToOpenClaw } from '@/lib/services/openclaw';
import { publishV2Event } from '@/lib/v2/event-bus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Action = 'run-report' | 'check-status' | 'ping';

export async function POST(req: Request) {
  const body = await req.json();
  const rawStream = String(body?.stream ?? '').trim();
  const action = String(body?.action ?? '').trim() as Action;

  // Normalize: accept key directly or displayName
  const normalized = rawStream.toLowerCase().replace(/\s+/g, '-');
  const def =
    streamByKey(normalized) ??
    REVENUE_STREAMS.find((s) => s.displayName.toLowerCase() === rawStream.toLowerCase());

  if (!def) {
    return NextResponse.json({ error: `Unknown stream: ${rawStream}` }, { status: 404 });
  }

  if (!['run-report', 'check-status', 'ping'].includes(action)) {
    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }

  if (action === 'ping') {
    const row = await prisma.revenueStreamStatus.upsert({
      where: { stream: def.key },
      create: { stream: def.key, status: 'unknown', requestedAt: new Date() },
      update: { requestedAt: new Date() },
    });

    await prisma.revenueStreamStatusLog.create({
      data: { stream: def.key, status: row.status, action: 'ping' },
    });

    publishV2Event('revenue-streams', 'status', {
      stream: def.key,
      status: row.status,
      requestedAt: row.requestedAt?.toISOString(),
    });

    return NextResponse.json({ ok: true, action: 'ping', requestedAt: row.requestedAt?.toISOString() });
  }

  // run-report or check-status: dispatch to OpenClaw in background
  const prompt = action === 'run-report' ? def.reportPrompt : def.statusPrompt;
  const agentId = agentForKey(def.leadBotKey);

  const row = await prisma.revenueStreamStatus.upsert({
    where: { stream: def.key },
    create: { stream: def.key, status: 'unknown', requestedAt: new Date() },
    update: { requestedAt: new Date() },
  });

  publishV2Event('revenue-streams', 'action', { stream: def.key, action, status: 'dispatching' });

  // Background: fire-and-forget, result lands via SSE when done
  void (async () => {
    try {
      const result = await dispatchToOpenClaw({ text: prompt, agentId, timeoutMs: 45_000 });
      const truncated = result.output.slice(0, 500);
      await prisma.revenueStreamStatus.update({
        where: { stream: def.key },
        data: { lastReportAt: new Date(), lastReport: truncated, note: truncated },
      });
      await prisma.revenueStreamStatusLog.create({
        data: { stream: def.key, status: row.status, note: truncated, action },
      });
      publishV2Event('revenue-streams', 'status', {
        stream: def.key,
        status: row.status,
        note: truncated,
        lastReportAt: new Date().toISOString(),
      });
    } catch (err) {
      const note = `Dispatch failed: ${err instanceof Error ? err.message : String(err)}`;
      await prisma.revenueStreamStatusLog
        .create({ data: { stream: def.key, status: row.status, note, action } })
        .catch(() => {});
      publishV2Event('revenue-streams', 'status', { stream: def.key, status: row.status, note });
    }
  })();

  return NextResponse.json({ ok: true, action, status: 'dispatching' });
}
