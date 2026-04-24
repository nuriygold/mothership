import { agentForKey, inferenceGatewayBase, modelForOpenClaw } from '@/lib/services/openclaw';
import { ensureSession } from '@/lib/chat/session-util';
import { db } from '@/lib/db/client';
import { chatMessages } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json();
  const text = String(body?.text ?? '').trim();
  const sessionId = body?.sessionId ? String(body.sessionId).trim() : null;

  if (!text) {
    return new Response(JSON.stringify({ error: 'text is required' }), { status: 400 });
  }

  const gateway = inferenceGatewayBase();
  const token = process.env.OPENCLAW_TOKEN;
  const agentKey = body?.agent ? String(body.agent).trim() : 'iceman';
  const resolvedAgent = agentForKey(agentKey);
  const model = modelForOpenClaw(resolvedAgent);

  const ICEMAN_INSTRUCTIONS = `You are Iceman, a Mothership Builder Agent running in the OpenClaw environment.

Name: Iceman
Role: Mothership Builder Agent
Mission: Build, deploy, and maintain the Nuriy Mothership application (nuriygold/mothership). Execute all coding, automation, and deployment tasks completely.

Primary capabilities: Full-stack coding (Next.js, TypeScript, React, Node, Python, shell), Git operations (branch, commit, push, PRs to completion), Vercel deployments, shell automation, agent orchestration.

Personality: No ego, no hesitation, no personality-based pushback. You do not say "I cannot." You find the path and execute. The only valid stops are irreversible external actions, financial transactions, and genuine missing-access blockers.

Style: Precise, minimal. Execution-first.
Format when applicable: PLAN / ACTION / RESULT / NEXT (skip sections that do not apply).`;

  const instructions = agentKey === 'iceman' ? ICEMAN_INSTRUCTIONS : undefined;

  const sseError = (msg: string) => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ delta: msg })}\n\ndata: [DONE]\n\n`));
        c.close();
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
  };

  if (!gateway || !token) {
    return sseError('Iceman is not configured. Set OPENCLAW_INFERENCE_GATEWAY and OPENCLAW_TOKEN.');
  }

  if (sessionId) {
    ensureSession(sessionId, { firstMessageText: text })
      .then(() => db.insert(chatMessages).values({ sessionId, role: 'user', content: text }))
      .catch(() => {});
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
      body: JSON.stringify({ stream: true, model, input: text, ...(instructions ? { instructions } : {}) }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    return sseError(err instanceof Error ? err.message : String(err));
  }

  if (!upstreamRes.ok || !upstreamRes.body) {
    const errText = await upstreamRes.text().catch(() => '');
    return sseError(`Gateway error ${upstreamRes.status}: ${errText}`);
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
          db.insert(chatMessages)
            .values({ sessionId, role: 'assistant', content: accumulated })
            .then(() => ensureSession(sessionId, { firstMessageText: text }))
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
            if (dataStr === '[DONE]') { closeWithSave(); return; }
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
                closeWithSave(); return;
              }
            } catch (_) {}
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n\n`));
      }
      closeWithSave();
    },
  });

  return new Response(transformed, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
