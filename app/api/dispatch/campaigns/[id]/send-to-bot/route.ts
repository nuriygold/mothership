import { NextResponse } from 'next/server';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { dispatchCampaigns, dispatchTasks } from '@/lib/db/schema';
import { dispatchToOpenClaw } from '@/lib/services/openclaw';
import { createAuditEvent } from '@/lib/services/audit';

export const dynamic = 'force-dynamic';

const BOT_DISPLAY: Record<string, string> = {
  adrian: 'Adrian',
  main: 'Adrian',
  iceman: 'Iceman',
  ruby: 'Ruby',
  emerald: 'Emerald',
  adobe: 'Adobe Pettaway',
  anchor: 'Anchor',
};

/**
 * POST /api/dispatch/campaigns/[id]/send-to-bot
 * Body: { botId: string; note?: string }
 *
 * Dispatches the full campaign output to the chosen bot with an optional assignment note.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const botId = String(body?.botId ?? '').trim();
    const note = body?.note ? String(body.note).trim() : '';

    if (!botId) {
      return NextResponse.json({ ok: false, message: 'botId is required' }, { status: 400 });
    }

    const [campaign] = await db
      .select()
      .from(dispatchCampaigns)
      .where(eq(dispatchCampaigns.id, params.id))
      .limit(1);
    if (!campaign) {
      return NextResponse.json({ ok: false, message: 'Campaign not found' }, { status: 404 });
    }

    const tasks = await db
      .select()
      .from(dispatchTasks)
      .where(eq(dispatchTasks.campaignId, campaign.id))
      .orderBy(asc(dispatchTasks.priority), asc(dispatchTasks.createdAt));

    const botName = BOT_DISPLAY[botId] ?? botId;

    const taskSummary = tasks
      .map((t, i) => {
        const icon = t.status === 'DONE' ? '✅' : t.status === 'FAILED' ? '❌' : '⏳';
        const output = t.output ? `\n\n${t.output}` : '';
        return `### ${i + 1}. ${t.title} (${t.status})${output}`;
      })
      .join('\n\n---\n\n');

    const prompt = [
      `# Campaign Assignment: ${campaign.title}`,
      '',
      note ? `**Note from dispatcher:** ${note}` : null,
      '',
      `**Status:** ${campaign.status}`,
      campaign.description ? `**Objective:** ${campaign.description}` : null,
      '',
      '## Task Outputs',
      '',
      taskSummary,
    ].filter((l): l is string => l !== null).join('\n');

    const result = await dispatchToOpenClaw({
      text: prompt,
      agentId: botId,
      sessionKey: `send-to-bot:${params.id}:${Date.now()}`,
    });

    await createAuditEvent({
      entityType: 'DispatchCampaign',
      entityId: params.id,
      eventType: 'SENT_TO_BOT',
      actorId: 'user',
      metadata: {
        botId,
        botName,
        note: note || null,
        campaignTitle: campaign.title,
      },
    }).catch(() => { /* audit best-effort */ });

    return NextResponse.json({ ok: true, botId, botName, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
