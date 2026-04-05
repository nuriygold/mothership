type DispatchInput = {
  text: string;
  agentId?: string;
  sessionKey?: string | null;
};

function agentForKey(key?: string) {
  if (!key) return process.env.OPENCLAW_DEFAULT_AGENT || 'main';
  if (key === 'ruby') return process.env.OPENCLAW_AGENT_RUBY || 'ruby';
  if (key === 'emerald') return process.env.OPENCLAW_AGENT_EMERALD || 'emerald';
  return key;
}

export async function dispatchToOpenClaw(input: DispatchInput) {
  const gateway = process.env.OPENCLAW_GATEWAY;
  const token = process.env.OPENCLAW_TOKEN;
  const defaultAgent = process.env.OPENCLAW_DEFAULT_AGENT || 'main';
  const model = process.env.OPENCLAW_MODEL || 'openclaw/ruby';

  if (!gateway || !token) {
    throw new Error('OPENCLAW_GATEWAY or OPENCLAW_TOKEN not set');
  }

  const agentId = agentForKey(input.agentId) || defaultAgent;
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
        if (payload?.event === 'response.output_text.delta') {
          output += payload?.data ?? '';
        } else if (payload?.event === 'response.error') {
          error = payload?.data ?? 'Unknown error';
        } else if (payload?.event === 'response.completed') {
          done = true;
          break;
        }
      } catch (_e) {
        // ignore parse errors on noise lines
      }
    }
  }

  if (error) {
    throw new Error(`OpenClaw error: ${error}`);
  }

  return {
    agentId,
    output: output.trim(),
  };
}

export async function checkGateway() {
  const gateway = process.env.OPENCLAW_GATEWAY;
  const token = process.env.OPENCLAW_TOKEN;
  if (!gateway || !token) {
    return { ok: false, message: 'Missing OPENCLAW_GATEWAY or OPENCLAW_TOKEN' };
  }
  try {
    const res = await fetch(`${gateway.replace(/\/$/, '')}/health`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (!res.ok) {
      return { ok: false, message: `Gateway responded ${res.status}` };
    }
    return { ok: true, message: 'Gateway reachable' };
  } catch (error) {
    return { ok: false, message: String(error) };
  }
}
