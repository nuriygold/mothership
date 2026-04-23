import { type NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { agentForKey } from '@/lib/services/openclaw';
import { getV2EmailFeed } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

const VALID_AGENTS = new Set(['adrian', 'ruby', 'emerald', 'adobe', 'anchor']);

type EmailSummary = { id: string; sender: string; subject: string; snippet: string };

export async function POST(req: NextRequest) {
  let body: {
    agentKey?: string;
    note?: string;
    emailIds?: string[];
    bucket?: string | null;
    summaries?: EmailSummary[];
    source?: string;
  } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const agentKey = String(body.agentKey ?? '').toLowerCase().trim();
  if (!VALID_AGENTS.has(agentKey)) {
    return NextResponse.json(
      { ok: false, error: `Unknown agent: ${agentKey || '(empty)'}` },
      { status: 400 },
    );
  }

  const note = String(body.note ?? '').trim();
  const emailIds = Array.isArray(body.emailIds) ? body.emailIds.filter(Boolean) : [];

  let summaries: EmailSummary[] = [];
  if (Array.isArray(body.summaries) && body.summaries.length > 0) {
    summaries = body.summaries
      .filter((s) => s && typeof s.id === 'string')
      .map((s) => ({
        id: s.id,
        sender: String(s.sender ?? ''),
        subject: String(s.subject ?? ''),
        snippet: String(s.snippet ?? '').slice(0, 500),
      }));
  } else if (emailIds.length > 0) {
    const feed = await getV2EmailFeed();
    summaries = emailIds
      .map((id) => feed.inbox.find((item) => item.id === id))
      .filter((email): email is NonNullable<typeof email> => !!email)
      .map((email) => ({
        id: email.id,
        sender: email.sender,
        subject: email.subject,
        snippet: String(email.snippet ?? email.preview ?? '').slice(0, 500),
      }));
  }

  const item = await prisma.agentInboxItem.create({
    data: {
      agentKey,
      note,
      source: String(body.source ?? 'email'),
      bucket: body.bucket ? String(body.bucket) : null,
      emailIds,
      emailSummaries: summaries,
    },
  });

  return NextResponse.json({
    ok: true,
    item: {
      id: item.id,
      agentKey: item.agentKey,
      resolvedAgent: agentForKey(agentKey),
      emailCount: emailIds.length,
    },
  });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const agentKey = url.searchParams.get('agentKey')?.toLowerCase() ?? undefined;
  const status = url.searchParams.get('status') ?? 'PENDING';

  const items = await prisma.agentInboxItem.findMany({
    where: {
      ...(agentKey ? { agentKey } : {}),
      status,
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ ok: true, items });
}
