import { desc, eq } from "drizzle-orm";
import type { Response } from "express";
import { db } from "@/lib/db/client";
import { chatMessages, chatSessions } from "@/lib/db/schema";
import { ensureSession } from "@/lib/chat/session-util";
import {
  addChatMessage,
  listChatMessages,
  listChatSessionSummaries,
  upsertChatSession as upsertChatSessionRow,
} from "@/lib/db/chat";
import { dispatchToOpenClaw } from "@/lib/services/openclaw";

const GENERIC_AGENT_ALIASES = new Set([
  "iceman",
  "hermes",
  "scorpion",
  "claude",
  "main",
  "adrian",
]);

const V2_AGENT_KEYS = new Set([
  "adrian",
  "ruby",
  "emerald",
  "adobe",
  "anchor",
]);

function normalizeAgentKey(value?: string | null) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw || null;
}

function agentFromSessionId(sessionId?: string | null) {
  const match = /^agent:([a-z0-9_-]+):/i.exec(String(sessionId ?? ""));
  return normalizeAgentKey(match?.[1]);
}

function isGenericAlias(agent: string) {
  return GENERIC_AGENT_ALIASES.has(agent);
}

export function isSupportedV2Agent(agent: string) {
  return V2_AGENT_KEYS.has(agent);
}

export function resolveDispatchAgentId(input: {
  agent?: string | null;
  sessionId?: string | null;
  routeAgent?: string | null;
}) {
  const routeAgent = normalizeAgentKey(input.routeAgent);
  if (routeAgent) {
    if (routeAgent === "adrian" || routeAgent === "main") return "main";
    if (isSupportedV2Agent(routeAgent)) return routeAgent;
  }

  const explicitAgent = normalizeAgentKey(input.agent);
  if (explicitAgent) {
    if (explicitAgent === "adrian" || explicitAgent === "main") return "main";
    if (isSupportedV2Agent(explicitAgent)) return explicitAgent;
    if (isGenericAlias(explicitAgent)) return "main";
  }

  const sessionAgent = agentFromSessionId(input.sessionId);
  if (sessionAgent) {
    if (sessionAgent === "adrian" || sessionAgent === "main") return "main";
    if (isSupportedV2Agent(sessionAgent)) return sessionAgent;
    if (isGenericAlias(sessionAgent)) return "main";
  }

  return "main";
}

export function writeSseJson(res: Response, payload: unknown) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function startSseResponse(res: Response) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

export async function listAgentSessions(agent: string) {
  const prefix = `agent:${agent}:`;
  const rows = await db
    .select({ id: chatSessions.id, updatedAt: chatSessions.updatedAt })
    .from(chatSessions)
    .orderBy(desc(chatSessions.updatedAt))
    .limit(200);

  const ids = rows
    .map((row) => row.id)
    .filter((id) => id.startsWith(prefix))
    .slice(0, 100);

  return listChatSessionSummaries(ids);
}

export async function readChatMessages(sessionId: string) {
  const messages = await listChatMessages(sessionId);
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt instanceof Date
      ? message.createdAt.toISOString()
      : String(message.createdAt ?? new Date().toISOString()),
  }));
}

export async function ensureChatSession(
  sessionId: string,
  title?: string | null,
  firstMessageText?: string,
) {
  await ensureSession(sessionId, {
    title,
    firstMessageText,
  });
}

export async function saveChatSessionTitle(sessionId: string, title?: string | null) {
  await upsertChatSessionRow(sessionId, title ?? null);
}

export async function deleteChatSession(sessionId: string) {
  await db.delete(chatMessages).where(eq(chatMessages.sessionId, sessionId));
  await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));
}

export async function dispatchAgentTurn(input: {
  text: string;
  sessionId: string;
  agentId?: string;
}) {
  const agentId = resolveDispatchAgentId({
    agent: input.agentId,
    sessionId: input.sessionId,
  });

  await ensureChatSession(input.sessionId, null, input.text);
  await addChatMessage(input.sessionId, "user", input.text);

  const result = await dispatchToOpenClaw({
    text: input.text,
    agentId,
    sessionKey: input.sessionId,
  });

  await addChatMessage(input.sessionId, "assistant", result.output);

  return {
    agentId,
    output: result.output,
  };
}
