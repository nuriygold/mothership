import { prisma } from '@/lib/prisma';
import { agentForKey, modelForOpenClaw } from '@/lib/services/openclaw';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Adobe's system prompt is configured at the gateway agent level (OPENCLAW_AGENT_ADOBE).
// The dispatch sends only the user's message text; the gateway handles identity + memory.

export async function POST(req: Request) {
  const body = await req.json();
  const text = String(body?.text ?? '').trim();
  const sessionId = body?.sessionId ? String(body.sessionId).trim() : null;

  if (!text) {
    return new Response(JSON.stringify({ error: 'text is required' }), { status: 400 });
  }

  const gateway = process.env.OPENCLAW_GATEWAY;
  const token = process.env.OPENCLAW_TOKEN;
  const resolvedAgent = agentForKey('adobe');
  const model = modelForOpenClaw(resolvedAgent);

  if (!gateway || !token) {
    const fallback = 'Adobe Pettaway is not reachable — OPENCLAW_GATEWAY or OPENCLAW_TOKEN is not configured.';
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ delta: fallback })}\n\ndata: [DONE]\n\n`));
        c.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  }

  // Persist session + user message (fire-and-forget)
  if (sessionId) {
    prisma.chatSession
      .upsert({ where: { id: sessionId }, create: { id: sessionId }, update: { updatedAt: new Date() } })
      .then(() => prisma.chatMessage.create({ data: { sessionId, role: 'user', content: text } }))
      .catch(() => {});
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${gateway.replace(/\/$/, '')}/v1/responses`, {
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
      let closed = false;

      function close() {
        if (closed) return;
        closed = true;
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
            if (dataStr === '[DONE]') { close(); return; }
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
              } else if (eventType === 'response.output_text.done') {
                if (!accumulated && evt?.text) {
                  accumulated = evt.text;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: evt.text })}\n\n`));
                }
              } else if (eventType === 'response.error') {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: payload?.data ?? evt?.error ?? 'Gateway error' })}\n\n`));
              } else if (eventType === 'response.completed') {
                close(); return;
              }
            } catch (_) {}
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
      }
      close();
    },
  });

  return new Response(transformed, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
