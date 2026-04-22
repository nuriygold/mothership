import { prisma } from '@/lib/prisma';
import { agentForKey, inferenceGatewayBase, modelForOpenClaw } from '@/lib/services/openclaw';
import { getV2FinanceOverview } from '@/lib/v2/orchestrator';
import type { V2FinanceOverviewFeed } from '@/lib/v2/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildSystemPrompt(finance: V2FinanceOverviewFeed): string {
  const accountLines = finance.accounts
    .map((a) => `  • ${a.name} (${a.type}): ${fmt(a.balance)}`)
    .join('\n');

  const payableLines = finance.payables.length
    ? finance.payables
        .map((p) => `  • ${p.vendor}: ${fmt(p.amount)} — due ${p.dueDate} [${p.status}]`)
        .join('\n')
    : '  (none)';

  const planLines = finance.plans.filter((p) => p.status === 'ACTIVE').length
    ? finance.plans
        .filter((p) => p.status === 'ACTIVE')
        .map((p) => `  • ${p.title}: ${p.progressPercent ?? 0}% complete${p.goal ? ` — goal: ${p.goal}` : ''}`)
        .join('\n')
    : '  (none)';

  const recentTxLines = finance.transactions.slice(0, 10).length
    ? finance.transactions
        .slice(0, 10)
        .map((t) => `  • [${t.date}] ${t.description}: ${fmt(t.amount)} (${t.category ?? 'uncategorized'})`)
        .join('\n')
    : '  (none)';

  const score = finance.healthScore
    ? `${finance.healthScore.score}/100 — ${finance.healthScore.message}`
    : 'unavailable';

  const netWorth =
    finance.netWorthHistory.length > 0
      ? (() => {
          const latest = finance.netWorthHistory[finance.netWorthHistory.length - 1];
          return `${fmt(latest.netWorth)} (assets ${fmt(latest.assets)}, liabilities ${fmt(latest.liabilities)})`;
        })()
      : 'unavailable';

  return [
    `You are Emerald — the financial intelligence and verification brain of the Mothership system.`,
    ``,
    `## Identity & Role`,
    `You are precise, auditable, and decision-ready. Your job is to understand what is happening financially`,
    `and why — tracing problems layer by layer before reaching conclusions. You operate at the intersection`,
    `of financial intelligence, system verification, and strategic diagnostics.`,
    ``,
    `Your core capabilities:`,
    `- Cash flow analysis and liquidity assessment`,
    `- Debt strategy and payable prioritization`,
    `- Budget compliance and subscription burden review`,
    `- Pattern detection: anomalies, recurring expenses, income streams`,
    `- Finance plan tracking and milestone verification`,
    `- Net worth trend analysis and health scoring`,
    `- System verification — confirming data integrity across accounts, transactions, and plans`,
    ``,
    `## Response Style`,
    `- Use bullet points and short lines. Bold key figures and terms.`,
    `- Never write dense paragraphs. Lead with the most actionable insight.`,
    `- When data is missing or uncertain, say so explicitly — do not fabricate.`,
    `- Cite specific numbers from the live snapshot when answering finance questions.`,
    ``,
    `## Live Financial Snapshot`,
    `*Generated: ${finance.generatedAt} | Status: ${finance.systemStatus}*`,
    ``,
    `### Accounts`,
    accountLines || '  (none)',
    ``,
    `### Pending Payables`,
    payableLines,
    ``,
    `### Active Plans`,
    planLines,
    ``,
    `### Recent Transactions (last 10)`,
    recentTxLines,
    ``,
    `### Net Worth`,
    netWorth,
    ``,
    `### Health Score`,
    score,
    ``,
    `---`,
    `Reference this snapshot directly when answering finance questions. If asked about something`,
    `not reflected in the data above, say so clearly and suggest what to check.`,
  ].join('\n');
}

export async function POST(req: Request) {
  const body = await req.json();
  const text = String(body?.text ?? '').trim();
  const sessionId = body?.sessionId ? String(body.sessionId).trim() : null;

  if (!text) {
    return new Response(JSON.stringify({ error: 'text is required' }), { status: 400 });
  }

  const gateway = inferenceGatewayBase();
  const token = process.env.OPENCLAW_TOKEN;
  const resolvedAgent = agentForKey('emerald');
  const model = modelForOpenClaw(resolvedAgent);

  if (!gateway || !token) {
    const fallback = 'Emerald is not configured. Set OPENCLAW_INFERENCE_GATEWAY (or OPENCLAW_GATEWAY) and OPENCLAW_TOKEN.';
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ delta: fallback })}\n\ndata: [DONE]\n\n`));
        c.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  }

  // Fetch live finance snapshot and chat history in parallel
  const [finance, history] = await Promise.all([
    getV2FinanceOverview(),
    sessionId
      ? prisma.chatMessage.findMany({
          where: { sessionId },
          orderBy: { createdAt: 'asc' },
          take: 20,
        })
      : Promise.resolve([]),
  ]);

  // Save user message (fire-and-forget)
  if (sessionId) {
    prisma.chatMessage.create({ data: { sessionId, role: 'user', content: text } }).catch(() => {});
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${gateway}/v1/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-openclaw-agent-id': resolvedAgent,
        ...(sessionId ? { 'x-openclaw-session-key': sessionId } : {}),
      },
      body: JSON.stringify({ stream: true, model, input: text }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ error: msg })}\n\ndata: [DONE]\n\n`));
        c.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  }

  if (!upstreamRes.ok || !upstreamRes.body) {
    const errText = await upstreamRes.text().catch(() => '');
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ error: `Gateway error ${upstreamRes.status}: ${errText}` })}\n\ndata: [DONE]\n\n`
          )
        );
        c.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const transformed = new ReadableStream({
    async start(controller) {
      const reader = upstreamRes.body!.getReader();
      let buf = '';
      let accumulated = '';
      let streamClosed = false;

      function closeWithSave() {
        if (streamClosed) return;
        streamClosed = true;
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
        if (accumulated && sessionId) {
          prisma.chatMessage
            .create({ data: { sessionId, role: 'assistant', content: accumulated } })
            .catch(() => {});
        }
      }

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (dataStr === '[DONE]') {
              closeWithSave();
              return;
            }
            try {
              const evt = JSON.parse(dataStr);
              const payload = evt?.data ?? evt;
              const eventType = payload?.event ?? evt?.type;
              if (eventType === 'response.output_text.delta') {
                const delta = payload?.data ?? evt?.delta ?? '';
                if (delta) {
                  accumulated += delta;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
                }
              } else if (eventType === 'response.output_text.done' && evt?.text) {
                accumulated += evt.text;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: evt.text })}\n\n`));
              } else if (eventType === 'response.error') {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ error: payload?.data ?? evt?.error ?? 'Gateway error' })}\n\n`)
                );
              } else if (eventType === 'response.completed') {
                closeWithSave();
                return;
              }
            } catch (_) {}
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      }
      closeWithSave();
    },
  });

  return new Response(transformed, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
