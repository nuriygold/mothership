import type { ToolDef } from '@/lib/tools/registry';

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
    case 'anchor':
    case 'ballast':
      return 'anchor';
    default:
      return raw;
  }
}

export function agentForKey(key?: string) {
  const requested = normalizeAgentId(key);
  const emeraldFallback = process.env.OPENCLAW_AGENT_EMERALD || 'emerald';
  if (requested === 'main') {
    return normalizeAgentId(process.env.OPENCLAW_AGENT_ADRIAN || process.env.OPENCLAW_DEFAULT_AGENT || emeraldFallback);
  }
  if (requested === 'ruby') {
    return normalizeAgentId(process.env.OPENCLAW_AGENT_RUBY || emeraldFallback);
  }
  if (requested === 'emerald') {
    return normalizeAgentId(emeraldFallback);
  }
  if (requested === 'adobe') {
    return normalizeAgentId(process.env.OPENCLAW_AGENT_ADOBE || emeraldFallback);
  }
  if (requested === 'anchor') {
    return normalizeAgentId(process.env.OPENCLAW_AGENT_ANCHOR || emeraldFallback);
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

/**
 * Returns the base URL for AI inference calls (POST /v1/responses).
 *
 * Prefer OPENCLAW_INFERENCE_GATEWAY when set — this separates the AI inference
 * endpoint from the data bridge (OPENCLAW_GATEWAY / mother.nuriy.com).
 * Falls back to OPENCLAW_GATEWAY for backward compatibility.
 */
export function inferenceGatewayBase(): string | undefined {
  const infer = String(process.env.OPENCLAW_INFERENCE_GATEWAY || '').trim();
  if (infer) return infer.replace(/\/$/, '');
  const legacy = String(process.env.OPENCLAW_GATEWAY || '').trim();
  return legacy ? legacy.replace(/\/$/, '') : undefined;
}

export async function dispatchToOpenClaw(input: DispatchInput & { timeoutMs?: number }) {
  const gateway = inferenceGatewayBase();
  const token = process.env.OPENCLAW_TOKEN;
  const defaultAgent = agentForKey();

  if (!gateway || !token) {
    throw new Error('OPENCLAW_INFERENCE_GATEWAY (or OPENCLAW_GATEWAY) and OPENCLAW_TOKEN must be set');
  }

  const agentId = agentForKey(input.agentId) || defaultAgent;
  const model = modelForOpenClaw(agentId);
  const body = {
    stream: true,
    model,
    input: input.text,
  };

  const res = await fetch(`${gateway}/v1/responses`, {
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
    if (res.status === 404) {
      throw new Error(
        `OpenClaw dispatch failed: 404 Not Found at ${gateway}/v1/responses. ` +
          `The configured gateway does not expose /v1/responses — set OPENCLAW_INFERENCE_GATEWAY ` +
          `to the correct AI inference endpoint. Raw: ${text}`
      );
    }
    throw new Error(`OpenClaw dispatch failed: ${res.status} ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let output = '';
  let done = false;
  let error: string | null = null;
  let buffer = '';

  try {
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      if (readerDone) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
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

const TOOL_CALL_RE = /<tool_call>([\s\S]*?)<\/tool_call>/g;

function parseToolCalls(text: string): Array<{ name: string; args: Record<string, unknown> }> {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let match: RegExpExecArray | null;
  TOOL_CALL_RE.lastIndex = 0;
  while ((match = TOOL_CALL_RE.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as { name?: string; args?: Record<string, unknown> };
      if (typeof parsed.name === 'string') {
        calls.push({ name: parsed.name, args: parsed.args ?? {} });
      }
    } catch {
      // ignore malformed tool call blocks
    }
  }
  return calls;
}

export async function dispatchWithTools(input: {
  text: string;
  agentId?: string;
  sessionKey: string;
  tools: ToolDef[];
  maxTurns?: number;
  timeoutMs?: number;
}): Promise<{ agentId: string; output: string; turns: number }> {
  const maxTurns = input.maxTurns ?? 6;
  const toolMap = new Map(input.tools.map((t) => [t.name, t]));
  let currentText = input.text;
  let lastResult: { agentId: string; output: string } | null = null;

  for (let turn = 0; turn < maxTurns; turn++) {
    lastResult = await dispatchToOpenClaw({
      text: currentText,
      agentId: input.agentId,
      sessionKey: input.sessionKey,
      timeoutMs: input.timeoutMs,
    });

    const toolCalls = parseToolCalls(lastResult.output);
    if (!toolCalls.length) {
      // No tool calls — agent is done
      return { ...lastResult, turns: turn + 1 };
    }

    // Execute all tool calls sequentially and collect results
    const resultParts: string[] = [];
    for (const call of toolCalls) {
      const tool = toolMap.get(call.name);
      if (!tool) {
        resultParts.push(`<tool_result name="${call.name}">Unknown tool: ${call.name}</tool_result>`);
        continue;
      }
      try {
        const result = await tool.execute(call.args);
        resultParts.push(`<tool_result name="${call.name}">${result}</tool_result>`);
      } catch (err) {
        resultParts.push(`<tool_result name="${call.name}">Error: ${String(err)}</tool_result>`);
      }
    }

    currentText = resultParts.join('\n') + '\nContinue with your task using the tool results above.';
  }

  // Reached maxTurns — return whatever we have
  return { agentId: lastResult?.agentId ?? (input.agentId ?? 'main'), output: lastResult?.output ?? '', turns: maxTurns };
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
