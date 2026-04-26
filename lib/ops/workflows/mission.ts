// Durable WDK workflow that drives a single mission from dispatch to
// completion. Every interesting interaction with the outside world is
// delegated to a `'use step'` function so it is durably cached and
// retryable. The workflow function itself is pure orchestration.
//
// AI calls go through the Vercel AI Gateway via plain model strings
// (no provider package imports needed). The default model is Anthropic
// Claude Sonnet 4.5; swap via the `MISSION_MODEL` env var.
//
// The workflow:
//   1. Promotes the campaign to RUNNING and records dispatch
//   2. Builds a `DurableAgent` whose tools cover artifact write/validate,
//      progress reporting, escalation, and tool placeholders for
//      web/MCP execution
//   3. Streams the agent's tool loop into a namespaced workflow stream
//   4. Validates every required artifact was produced; retries once if not
//   5. Marks the campaign COMPLETED only when all required artifacts pass
//   6. Escalates (BLOCKED) on a true blocker; never on transient failure

import { DurableAgent } from '@workflow/ai/agent';
import { sleep, FatalError } from 'workflow';
import { z } from 'zod';
import {
  emitFeedEvent,
  escalate,
  extractWebContent,
  markCampaignStatus,
  mcpInvoke,
  recordBatch,
  validateArtifact,
  writeArtifact,
} from './steps';

const DEFAULT_MODEL =
  (typeof process !== 'undefined' && process.env?.MISSION_MODEL) ||
  'anthropic/claude-sonnet-4-5';

export interface MissionInput {
  campaignId: string;
  name: string;
  objective: string;
  leadAgentId: string;
  requiredArtifacts: string[];
  minimumBatchSize: number;
  executionMode: 'STANDARD' | 'AGGRESSIVE';
}

export interface MissionResult {
  campaignId: string;
  success: boolean;
  artifactsProduced: string[];
  artifactsMissing: string[];
}

export async function missionWorkflow(input: MissionInput): Promise<MissionResult> {
  'use workflow';

  if (!input.campaignId) {
    throw new FatalError('missionWorkflow: campaignId is required');
  }

  // ── 1. Mark started ───────────────────────────────────────────────────────
  await markCampaignStatus(input.campaignId, 'RUNNING');
  await emitFeedEvent(
    input.campaignId,
    'info',
    `Mission started · ${input.executionMode.toLowerCase()} mode · model=${DEFAULT_MODEL}`,
    0.05
  );

  // ── 2. Build the agent with mission-specific tools ────────────────────────
  const agent = new DurableAgent({
    model: DEFAULT_MODEL,
    system: buildSystemPrompt(input),
    tools: {
      writeArtifact: {
        description:
          'Persist content to a named artifact file (e.g. products.md, ledger-diff.md). Use this for every required artifact.',
        inputSchema: z.object({
          name: z.string().describe('Artifact filename (e.g. "products.md")'),
          content: z.string().describe('Full content of the artifact'),
          rows: z
            .number()
            .nullable()
            .describe('Optional row count if the artifact is tabular'),
        }),
        execute: async ({ name, content, rows }) =>
          writeArtifact(input.campaignId, {
            name,
            content,
            rows: rows ?? undefined,
          }),
      },

      validateArtifact: {
        description:
          'Validate that an artifact was produced and meets the minimum size. Call this after writing each required artifact.',
        inputSchema: z.object({
          name: z.string(),
          minSize: z.number().nullable().describe('Minimum byte size'),
        }),
        execute: async ({ name, minSize }) =>
          validateArtifact(input.campaignId, name, minSize ?? 1),
      },

      reportProgress: {
        description:
          'Report progress fraction (0..1) and a human-readable status message. Call this between major steps.',
        inputSchema: z.object({
          progress: z.number().min(0).max(1),
          message: z.string(),
        }),
        execute: async ({ progress, message }) =>
          emitFeedEvent(input.campaignId, 'info', message, progress),
      },

      recordBatch: {
        description:
          'Record completion of a processing batch with its row count.',
        inputSchema: z.object({
          batchIndex: z.number().int().min(1),
          rowCount: z.number().int().min(0),
          message: z.string().nullable(),
        }),
        execute: async ({ batchIndex, rowCount, message }) =>
          recordBatch(input.campaignId, {
            batchIndex,
            rowCount,
            message: message ?? undefined,
          }),
      },

      extractWebContent: {
        description:
          'Extract content from a public web URL via the browser pool. Use only for live web sources you cannot infer from your training data.',
        inputSchema: z.object({
          url: z.string().url(),
          selector: z
            .string()
            .nullable()
            .describe('Optional CSS selector to scope extraction'),
        }),
        execute: async ({ url, selector }) =>
          extractWebContent(input.campaignId, {
            url,
            selector: selector ?? undefined,
          }),
      },

      mcpInvoke: {
        description:
          'Invoke a tool exposed by an MCP server (Shopify, GitHub, Slack, etc.).',
        inputSchema: z.object({
          server: z.string(),
          tool: z.string(),
          input: z.unknown().describe('Arbitrary JSON-serializable input'),
        }),
        execute: async ({ server, tool, input: toolInput }) =>
          mcpInvoke(input.campaignId, { server, tool, input: toolInput }),
      },

      escalate: {
        description:
          'Escalate to human review. Use ONLY for true blockers: missing credentials, schema conflicts, contractual issues. Do NOT escalate retryable failures.',
        inputSchema: z.object({
          reason: z.string(),
          requiredInput: z
            .string()
            .nullable()
            .describe(
              'If escalation is gated on a specific input (e.g. an API key), name it'
            ),
        }),
        execute: async ({ reason, requiredInput }) =>
          escalate(input.campaignId, reason, requiredInput ?? undefined),
      },
    },
  });

  // ── 3. Run the agent's tool loop ──────────────────────────────────────────
  const userPrompt = buildUserPrompt(input);

  let agentResult;
  try {
    agentResult = await agent.stream({
      messages: [{ role: 'user', content: userPrompt }],
      maxSteps: input.executionMode === 'AGGRESSIVE' ? 24 : 16,
    });
  } catch (err) {
    await emitFeedEvent(
      input.campaignId,
      'error',
      `Agent loop failed: ${err instanceof Error ? err.message : String(err)}`
    );
    await escalate(
      input.campaignId,
      'Agent loop terminated unexpectedly',
      undefined
    );
    return {
      campaignId: input.campaignId,
      success: false,
      artifactsProduced: [],
      artifactsMissing: input.requiredArtifacts,
    };
  }

  // ── 4. Validate every required artifact ──────────────────────────────────
  const validations = await Promise.all(
    input.requiredArtifacts.map((name) =>
      validateArtifact(input.campaignId, name, 1)
    )
  );
  const missing = input.requiredArtifacts.filter((_, i) => !validations[i].valid);

  // ── 5. Retry once for any missing artifacts ──────────────────────────────
  if (missing.length > 0) {
    await emitFeedEvent(
      input.campaignId,
      'warn',
      `Retrying missing artifacts: ${missing.join(', ')}`,
      0.7
    );
    await sleep('5s');

    const retryResult = await agent.stream({
      messages: [
        ...agentResult.messages,
        {
          role: 'user',
          content: `These required artifacts were not produced: ${missing.join(
            ', '
          )}. Produce them now using writeArtifact, then validateArtifact each one. If you cannot produce one for a real reason, escalate that specific one.`,
        },
      ],
      maxSteps: 8,
    });
    agentResult.messages = retryResult.messages;
  }

  // ── 6. Final validation pass ─────────────────────────────────────────────
  const finalValidations = await Promise.all(
    input.requiredArtifacts.map((name) =>
      validateArtifact(input.campaignId, name, 1)
    )
  );
  const stillMissing = input.requiredArtifacts.filter(
    (_, i) => !finalValidations[i].valid
  );
  const produced = input.requiredArtifacts.filter(
    (_, i) => finalValidations[i].valid
  );

  // ── 7. Resolve final status ──────────────────────────────────────────────
  if (stillMissing.length === 0) {
    await markCampaignStatus(input.campaignId, 'COMPLETED');
    await emitFeedEvent(
      input.campaignId,
      'success',
      `Mission complete · ${produced.length}/${input.requiredArtifacts.length} artifacts produced`,
      1
    );
    return {
      campaignId: input.campaignId,
      success: true,
      artifactsProduced: produced,
      artifactsMissing: [],
    };
  }

  await escalate(
    input.campaignId,
    `Mission ended without all required artifacts. Missing: ${stillMissing.join(', ')}`,
    undefined
  );
  return {
    campaignId: input.campaignId,
    success: false,
    artifactsProduced: produced,
    artifactsMissing: stillMissing,
  };
}

// ── Prompt construction ─────────────────────────────────────────────────────
function buildSystemPrompt(input: MissionInput): string {
  const agentName = input.leadAgentId.replace(/^agent_/, '');
  return `You are ${agentName.toUpperCase()}, a durable mission agent inside Mothership Ops.

Mission: "${input.name}"
Objective: ${input.objective}
Execution mode: ${input.executionMode}${
    input.executionMode === 'AGGRESSIVE'
      ? ' (no batch pauses, fallback enforced on every retry)'
      : ''
  }
Minimum batch size: ${input.minimumBatchSize}
Required artifacts: ${input.requiredArtifacts.join(', ')}

You have these tools:
  • writeArtifact      — persist a named file (use for every required artifact)
  • validateArtifact   — confirm an artifact meets minimum size
  • reportProgress     — report progress (0..1) with a status message
  • recordBatch        — record completion of a processing batch
  • extractWebContent  — extract from a public URL via the browser pool
  • mcpInvoke          — call an MCP-exposed tool
  • escalate           — escalate ONLY for true blockers

Hard rules:
  1. Produce every required artifact via writeArtifact, then validateArtifact each one.
  2. Use reportProgress between major steps so the operator sees you working.
  3. NEVER escalate for transient or retryable failures — try a fallback first.
  4. NEVER fabricate live data; if you cannot fetch it, write what you can and note the gap in the artifact, or escalate the specific artifact.
  5. The mission completes only when every required artifact validates.`;
}

function buildUserPrompt(input: MissionInput): string {
  return `Begin mission "${input.name}".

Objective:
${input.objective}

Required artifacts to produce:
${input.requiredArtifacts.map((a) => `  - ${a}`).join('\n')}

Use the tools to produce each artifact, validate them, and report progress as you go. When all required artifacts pass validation, summarize what was produced in your final assistant message.`;
}
