import { ensureSession } from '@/lib/chat/session-util';
import { db } from '@/lib/db/client';
import { chatMessages } from '@/lib/db/schema';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Provider = 'anthropic' | 'openai' | 'groq' | 'together' | 'azure';
type Message = { role: 'user' | 'assistant'; content: string };

function persistMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  firstMessageText?: string
) {
  if (!sessionId || !content) return;
  ensureSession(sessionId, { firstMessageText })
    .then(() => db.insert(chatMessages).values({ id: randomUUID(), sessionId, role, content }))
    .catch(() => {});
}

const OPENAI_BASE: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  together: 'https://api.together.xyz/v1',
};

const AZURE_API_VERSION = '2025-04-01-preview';

function errSSE(msg: string): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      c.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\ndata: [DONE]\n\n`));
      c.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}

function sseHeaders() {
  return { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' };
}

async function pipeAnthropic(upstream: Response, onDone?: (text: string) => void): Promise<Response> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const body = new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(encoder.encode(s));
      const reader = upstream.body!.getReader();
      let buf = '';
      let accumulated = '';
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        enqueue('data: [DONE]\n\n');
        controller.close();
        onDone?.(accumulated);
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            try {
              const evt = JSON.parse(raw);
              if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
                accumulated += evt.delta.text;
                enqueue(`data: ${JSON.stringify({ delta: evt.delta.text })}\n\n`);
              } else if (evt.type === 'message_stop') {
                finish();
                return;
              } else if (evt.type === 'error') {
                enqueue(`data: ${JSON.stringify({ error: evt.error?.message ?? 'Anthropic error' })}\n\n`);
                finish();
                return;
              }
            } catch {}
          }
        }
      } catch (err) {
        enqueue(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n\n`);
      }
      finish();
    },
  });

  return new Response(body, { headers: sseHeaders() });
}

async function pipeOpenAICompat(upstream: Response, onDone?: (text: string) => void): Promise<Response> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const body = new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(encoder.encode(s));
      const reader = upstream.body!.getReader();
      let buf = '';
      let accumulated = '';
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        enqueue('data: [DONE]\n\n');
        controller.close();
        onDone?.(accumulated);
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const raw = line.slice(5).trim();
            if (raw === '[DONE]') {
              finish();
              return;
            }
            try {
              const evt = JSON.parse(raw);
              const delta = evt.choices?.[0]?.delta?.content;
              if (delta) {
                accumulated += delta;
                enqueue(`data: ${JSON.stringify({ delta })}\n\n`);
              }
              if (evt.choices?.[0]?.finish_reason === 'stop') {
                finish();
                return;
              }
            } catch {}
          }
        }
      } catch (err) {
        enqueue(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n\n`);
      }
      finish();
    },
  });

  return new Response(body, { headers: sseHeaders() });
}

export async function POST(req: Request) {
  const body = await req.json();
  const provider: Provider = body?.provider ?? 'anthropic';
  const model: string = String(body?.model ?? '');
  const apiKey: string = String(body?.apiKey ?? '');
  const messages: Message[] = Array.isArray(body?.messages) ? body.messages : [];
  const system: string = String(body?.system ?? '');
  const azureEndpoint: string = String(body?.azureEndpoint ?? '').replace(/\/$/, '');
  const sessionId: string = body?.sessionId ? String(body.sessionId).trim() : '';

  if (!model) return errSSE('Model required');
  if (!messages.length) return errSSE('No messages');

  const firstUserText = messages.find((m) => m.role === 'user')?.content ?? '';
  if (sessionId) {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser?.content) persistMessage(sessionId, 'user', lastUser.content, firstUserText);
  }
  const onAssistantDone = (text: string) => {
    if (sessionId && text) persistMessage(sessionId, 'assistant', text, firstUserText);
  };

  if (provider === 'azure') {
    const endpoint = (process.env.AZURE_OPENAI_ENDPOINT ?? azureEndpoint).replace(/\/$/, '');
    const key = process.env.AZURE_OPENAI_API_KEY ?? apiKey;
    const deployment = process.env.AZURE_OPENAI_MODEL ?? model;
    if (!endpoint) return errSSE('Azure endpoint required');
    if (!key) return errSSE('Azure API key required');
    if (!deployment) return errSSE('Azure deployment name required');
    const url = `${endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${AZURE_API_VERSION}`;
    const allMessages = system ? [{ role: 'system' as const, content: system }, ...messages] : messages;
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: 'POST',
        headers: { 'api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream: true, messages: allMessages }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      return errSSE(err instanceof Error ? err.message : String(err));
    }
    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return errSSE(`Azure ${upstream.status}: ${text.slice(0, 200)}`);
    }
    return pipeOpenAICompat(upstream, onAssistantDone);
  }

  if (!apiKey) return errSSE('API key required');

  if (provider === 'anthropic') {
    let upstream: Response;
    try {
      upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          stream: true,
          ...(system ? { system } : {}),
          messages,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      return errSSE(err instanceof Error ? err.message : String(err));
    }

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return errSSE(`Anthropic ${upstream.status}: ${text.slice(0, 200)}`);
    }

    return pipeAnthropic(upstream, onAssistantDone);
  }

  const baseUrl = OPENAI_BASE[provider];
  if (!baseUrl) return errSSE(`Unknown provider: ${provider}`);

  const allMessages = system ? [{ role: 'system' as const, content: system }, ...messages] : messages;

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, stream: true, messages: allMessages }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return errSSE(err instanceof Error ? err.message : String(err));
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    return errSSE(`${provider} ${upstream.status}: ${text.slice(0, 200)}`);
  }

  return pipeOpenAICompat(upstream, onAssistantDone);
}
