// Step functions invoked by the durable mission workflow.
//
// Every function below uses the `'use step'` directive so the WDK runtime:
//   • runs them with full Node.js access (no workflow sandbox restrictions)
//   • caches their output for replay on retry / resume
//   • makes them retryable as independent units of work
//
// These are intentionally thin wrappers around the in-memory store. Once a
// real Postgres-backed schema exists, swap the store calls below for Drizzle
// inserts/updates and the workflow will keep running unchanged.

import {
  getCampaignArtifact,
  incrementBatchCount,
  recordEvent,
  setCampaignBlocker,
  setCampaignProgress,
  setCampaignStatus,
  upsertArtifact,
} from '../store';
import type { CampaignStatus, FeedEvent } from '../types';

// ── Feed events ─────────────────────────────────────────────────────────────
export async function emitFeedEvent(
  campaignId: string,
  level: FeedEvent['level'],
  message: string,
  progress?: number
): Promise<{ ok: true }> {
  'use step';
  recordEvent(campaignId, { level, message });
  if (typeof progress === 'number') {
    setCampaignProgress(campaignId, progress);
  }
  return { ok: true };
}

// ── Status transitions ──────────────────────────────────────────────────────
export async function markCampaignStatus(
  campaignId: string,
  status: CampaignStatus
): Promise<{ ok: true }> {
  'use step';
  setCampaignStatus(campaignId, status);
  return { ok: true };
}

// ── Artifact creation ───────────────────────────────────────────────────────
// `writeArtifact` is the workhorse the agent calls to persist its outputs.
// Real version should write to Vercel Blob and record metadata in Postgres;
// for now it goes to the in-memory mirror so /ops shows it immediately.
export async function writeArtifact(
  campaignId: string,
  args: { name: string; content: string; rows?: number }
): Promise<{ written: string; size: number }> {
  'use step';
  const a = upsertArtifact(campaignId, args);
  recordEvent(campaignId, {
    level: 'success',
    message: `Wrote ${args.name} (${a?.size ?? 0} bytes${args.rows ? `, ${args.rows} rows` : ''})`,
  });
  return { written: args.name, size: a?.size ?? 0 };
}

// ── Validation ──────────────────────────────────────────────────────────────
// A simple "did the artifact get produced and meet a minimum size" check.
// Replace with a full schema/contract validator once you settle the contracts.
export async function validateArtifact(
  campaignId: string,
  name: string,
  minSize: number = 1
): Promise<{ valid: boolean; reason?: string }> {
  'use step';
  const a = getCampaignArtifact(campaignId, name);
  if (!a) {
    return { valid: false, reason: `Artifact "${name}" not produced` };
  }
  if (a.size < minSize) {
    return {
      valid: false,
      reason: `Artifact "${name}" is ${a.size} bytes; required at least ${minSize}`,
    };
  }
  return { valid: true };
}

// ── Escalation ──────────────────────────────────────────────────────────────
// Marks the campaign as BLOCKED with structured blocker metadata so the
// watchdog + UI can surface it. Should be reserved for true blockers
// (missing credentials, schema conflict, contractual constraint), not
// retryable transient failures.
export async function escalate(
  campaignId: string,
  reason: string,
  requiredInput?: string
): Promise<{ escalated: true }> {
  'use step';
  setCampaignBlocker(campaignId, {
    type: requiredInput ? 'MISSING_INPUT' : 'BLOCKER',
    requiredInput: requiredInput ?? '',
    attempts: 1,
    detectedAt: new Date().toISOString(),
  });
  recordEvent(campaignId, {
    level: 'error',
    message: `Escalated: ${reason}${requiredInput ? ` (need: ${requiredInput})` : ''}`,
  });
  setCampaignStatus(campaignId, 'BLOCKED');
  return { escalated: true };
}

// ── Batch progress ──────────────────────────────────────────────────────────
export async function recordBatch(
  campaignId: string,
  args: { batchIndex: number; rowCount: number; message?: string }
): Promise<{ ok: true }> {
  'use step';
  incrementBatchCount(campaignId);
  recordEvent(campaignId, {
    level: 'success',
    message:
      args.message ??
      `Batch ${args.batchIndex} committed (${args.rowCount} rows)`,
  });
  return { ok: true };
}

// ── Tool placeholder: web extraction ────────────────────────────────────────
// This is where Playwright / a browser pool would be invoked. Until that
// surface is wired up we return a structured "not-implemented" payload so
// the agent's tool loop sees a deterministic failure mode rather than a
// fake success. The agent can then decide to escalate or try a different
// tool, exactly as it would against a real flaky integration.
export async function extractWebContent(
  campaignId: string,
  args: { url: string; selector?: string }
): Promise<{
  ok: false;
  reason: string;
  url: string;
}> {
  'use step';
  recordEvent(campaignId, {
    level: 'warn',
    message: `Web extraction not yet wired (${args.url})`,
  });
  return {
    ok: false,
    reason:
      'Browser tool not yet provisioned. Agent should write the artifact from its own knowledge or escalate.',
    url: args.url,
  };
}

// ── Tool placeholder: MCP invocation ────────────────────────────────────────
// Same shape as extractWebContent — returns a deterministic "not-wired"
// response until the MCP transport is configured.
export async function mcpInvoke(
  campaignId: string,
  args: { server: string; tool: string; input: unknown }
): Promise<{
  ok: false;
  reason: string;
  server: string;
  tool: string;
}> {
  'use step';
  recordEvent(campaignId, {
    level: 'warn',
    message: `MCP tool not yet wired (${args.server}/${args.tool})`,
  });
  return {
    ok: false,
    reason:
      'MCP transport not yet provisioned. Agent should rely on direct tools or escalate.',
    server: args.server,
    tool: args.tool,
  };
}
