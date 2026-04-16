import { agentForKey, inferenceGatewayBase, modelForOpenClaw } from '@/lib/services/openclaw';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_KEYS = new Set(['adrian', 'ruby', 'emerald', 'adobe']);

export async function POST(req: Request, { params }: { params: Promise<{ botKey: string }> }) {
  const { botKey } = await params;

  if (!VALID_KEYS.has(botKey)) {
    return Response.json({ error: 'Unknown bot' }, { status: 404 });
  }

  const body = await req.json();
  const text = String(body?.text ?? '').trim();
  if (!text) {
    return Response.json({ error: 'text is required' }, { status: 400 });
  }

  const gateway = inferenceGatewayBase();
  const token = process.env.OPENCLAW_TOKEN;

  // Map bot key to OpenClaw agent ID (adrian uses 'main')
  const agentKey = botKey === 'adrian' ? 'main' : botKey;
  const resolvedAgent = agentForKey(agentKey);
  const model = modelForOpenClaw(resolvedAgent);

  if (!gateway || !token) {
    const name = botKey.charAt(0).toUpperCase() + botKey.slice(1);
    const msg = `${name} is not reachable — OPENCLAW_INFERENCE_GATEWAY (or OPENCLAW_GATEWAY) and OPENCLAW_TOKEN must be set.`;
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ delta: msg })}\n\ndata: [DONE]\n\n`));
        c.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(`${gateway}/v1/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-openclaw-agent-id': resolvedAgent,
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
      let closed = false;

      function close() {
        if (closed) return;
        closed = true;
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
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
                if (delta) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
              } else if (eventType === 'response.output_text.done') {
                if (evt?.text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: evt.text })}\n\n`));
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
