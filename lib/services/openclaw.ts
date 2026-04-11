type DispatchInput = {
  text: string;
  agentId?: string;
  sessionKey?: string | null;
};

function normalizeAgentId(value?: string | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return 'main';

  switch (raw.toLowerCase()) {
    case 'adrian':
    case 'main':
      return 'main';
    case 'ruby':
      return 'ruby';
    case 'emerald':
      return 'emerald';
    case 'adobe':
      return 'adobe';
    default:
      return raw;
  }
}

export function agentForKey(key?: string) {
  const requested = normalizeAgentId(key);
  if (requested === 'main') {
    return normalizeAgentId(process.env.OPENCLAW_AGENT_ADRIAN || process.env.OPENCLAW_DEFAULT_AGENT || 'main');
  }
  if (requested === 'ruby') {
    return normalizeAgentId(process.env.OPENCLAW_AGENT_RUBY || 'ruby');
  }
  if (requested === 'emerald') {
    return normalizeAgentId(process.env.OPENCLAW_AGENT_EMERALD || 'emerald');
  }
  if (requested === 'adobe') {
    return normalizeAgentId(process.env.OPENCLAW_AGENT_ADOBE || 'adobe');
  }
  return requested;
}

export function modelForOpenClaw(agentId?: string) {
  const configured = String(process.env.OPENCLAW_MODEL || '').trim();
  if (configured === 'openclaw' || configured.startsWith('openclaw/')) {
    return configured;
  }

  const resolvedAgent = agentForKey(agentId);
  return resolvedAgent === 'main' ? 'openclaw/main' : `openclaw/${resolvedAgent}`;
}

export async function dispatchToOpenClaw(input: DispatchInput & { timeoutMs?: number }) {
  const gateway = process.env.OPENCLAW_GATEWAY;
  const token = process.env.OPENCLAW_TOKEN;
  const defaultAgent = agentForKey();

  if (!gateway || !token) {
    throw new Error('OPENCLAW_GATEWAY or OPENCLAW_TOKEN not set');
  }

  const agentId = agentForKey(input.agentId) || defaultAgent;
  const model = modelForOpenClaw(agentId);
  const body = {
    stream: true,
    model,
    input: input.text,
  };

  const res = await fetch(`${gateway.replace(/\/$/, '')}/v1/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-openclaw-agent-id': agentId,
      ...(input.sessionKey ? { 'x-openclaw-session-key': input.sessionKey } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(input.timeoutMs ?? 30_000),
  });

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenClaw dispatch failed: ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let output = '';
  let done = false;
  let error: string | null = null;

  try {
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();
        if (dataStr === '[DONE]') {
          done = true;
          break;
        }
        try {
          const evt = JSON.parse(dataStr);
          const payload = evt?.data ?? evt;
          const eventType = payload?.event ?? evt?.type;
          if (eventType === 'response.output_text.delta') {
            output += payload?.data ?? evt?.delta ?? '';
          } else if (eventType === 'response.output_text.done') {
            output = evt?.text ?? payload?.text ?? output;
          } else if (eventType === 'response.error') {
            error = payload?.data ?? evt?.error ?? 'Unknown error';
          } else if (eventType === 'response.completed') {
            done = true;
            break;
          }
        } catch (_e) {
          // ignore parse errors on noise lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (error) {
    throw new Error(`OpenClaw error: ${error}`);
  }

  return {
    agentId,
    output: output.trim(),
  };
}

export async function checkGateway(): Promise<{ ok: boolean; reason: string }> {
  const gateway = process.env.OPENCLAW_GATEWAY;
  const token = process.env.OPENCLAW_TOKEN;
  if (!gateway || !token) {
    return { ok: false, reason: 'Missing OPENCLAW_GATEWAY or OPENCLAW_TOKEN' };
  }
  try {
    const res = await fetch(`${gateway.replace(/\/$/, '')}/health`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { ok: false, reason: `Gateway responded ${res.status}` };
    }
    return { ok: true, reason: 'Gateway reachable' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    const reason = isTimeout
      ? `Gateway timed out after 10s (${gateway})`
      : `Gateway unreachable: ${msg} (${gateway})`;
    return { ok: false, reason };
  }
}
