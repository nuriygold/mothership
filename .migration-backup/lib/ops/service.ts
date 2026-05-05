import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db/client';
import {
  mcAgents,
  mcArtifacts,
  mcBlockers,
  mcCampaignAgents,
  mcCampaigns,
  mcEvents,
  mcExecutionAttempts,
  mcResumeDirectives,
} from '@/lib/db/schema';
import type { JsonValue } from '@/lib/db/json';
import type {
  Agent,
  Campaign,
  CampaignArtifact,
  CampaignBlocker,
  CampaignControlAction,
  CampaignQuickStats,
  CampaignStatus,
  CreateCampaignInput,
  ExecutionMode,
  FeedEvent,
  OpsTickerSummary,
  SystemRules,
  WatchdogState,
} from './types';

type CampaignDbStatus =
  | 'draft'
  | 'approved'
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'blocked'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'archived';

type OpsMetadata = {
  leadAgentId?: string;
  requiredArtifacts?: string[];
  minimumBatchSize?: number;
  executionMode?: ExecutionMode;
  workflowRunId?: string | null;
  demo?: boolean;
  quickStats?: CampaignQuickStats;
  progress?: number;
  lastActivityAt?: string;
  terminalStatus?: CampaignStatus | null;
  hookDebug?: JsonValue;
};

const STALE_MINUTES = 12;
const DEFAULT_AGENTS: Array<{
  id: string;
  name: string;
  domain: string;
  capabilities: string[];
}> = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Adrian',
    domain: 'Web extraction',
    capabilities: ['catalog audit', 'product extraction', 'browser fallback'],
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'Ruby',
    domain: 'Outreach',
    capabilities: ['campaign drafting', 'creator outreach', 'content QA'],
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'Iceman',
    domain: 'Build & deploy',
    capabilities: ['build orchestration', 'deploy gating', 'release notes'],
  },
  {
    id: '44444444-4444-4444-4444-444444444444',
    name: 'Marvin',
    domain: 'Finance',
    capabilities: ['ledger reconciliation', 'payable scan', 'cash projection'],
  },
];

let systemRules: SystemRules = {
  executionMode: true,
  fallbackEnforcement: true,
  batchMinimum: 5,
  watchdogIntervalMinutes: 10,
  blockerThreshold: 3,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function json<T>(value: T): JsonValue {
  return value as unknown as JsonValue;
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : value;
}

function readOpsMetadata(metadata: JsonValue | null | undefined): OpsMetadata {
  const root = isRecord(metadata) ? metadata : {};
  const ops = isRecord(root.ops) ? root.ops : {};
  const quickStats = isRecord(ops.quickStats) ? ops.quickStats : {};

  return {
    leadAgentId:
      typeof ops.leadAgentId === 'string'
        ? ops.leadAgentId
        : typeof root.leadAgentId === 'string'
          ? root.leadAgentId
          : undefined,
    requiredArtifacts: asStringArray(ops.requiredArtifacts),
    minimumBatchSize: asNumber(ops.minimumBatchSize, 5),
    executionMode: ops.executionMode === 'AGGRESSIVE' ? 'AGGRESSIVE' : 'STANDARD',
    workflowRunId: typeof ops.workflowRunId === 'string' ? ops.workflowRunId : null,
    demo: Boolean(ops.demo),
    quickStats: {
      filesUpdated: asNumber(quickStats.filesUpdated, 0),
      rowsProcessed: asNumber(quickStats.rowsProcessed, 0),
      batchCount: asNumber(quickStats.batchCount, 0),
    },
    progress: typeof ops.progress === 'number' ? Math.max(0, Math.min(1, ops.progress)) : undefined,
    lastActivityAt: typeof ops.lastActivityAt === 'string' ? ops.lastActivityAt : undefined,
    terminalStatus:
      ops.terminalStatus === 'CANCELLED' || ops.terminalStatus === 'FAILED'
        ? ops.terminalStatus
        : null,
    hookDebug: ops.hookDebug as JsonValue | undefined,
  };
}

function mergeOpsMetadata(existing: JsonValue | null | undefined, patch: Partial<OpsMetadata>): JsonValue {
  const root = isRecord(existing) ? existing : {};
  const ops = isRecord(root.ops) ? root.ops : {};
  return json({
    ...root,
    ops: {
      ...ops,
      ...patch,
    },
  });
}

function buildProgressSummary(ops: OpsMetadata): JsonValue {
  return json({
    progress: ops.progress ?? 0,
    quickStats: ops.quickStats ?? { filesUpdated: 0, rowsProcessed: 0, batchCount: 0 },
    workflowRunId: ops.workflowRunId ?? null,
    demo: Boolean(ops.demo),
  });
}

function mapUiStatus(status: CampaignDbStatus, ops: OpsMetadata): CampaignStatus {
  if (status === 'archived' && ops.terminalStatus === 'CANCELLED') return 'CANCELLED';
  if (status === 'running') return 'RUNNING';
  if (status === 'blocked') return 'BLOCKED';
  if (status === 'completed') return 'COMPLETED';
  if (status === 'failed') return 'FAILED';
  return 'IDLE';
}

function mapDbStatus(status: CampaignStatus): CampaignDbStatus {
  switch (status) {
    case 'RUNNING':
      return 'running';
    case 'BLOCKED':
      return 'blocked';
    case 'COMPLETED':
      return 'completed';
    case 'FAILED':
      return 'failed';
    case 'CANCELLED':
      return 'archived';
    case 'DEPLOYING':
    case 'IDLE':
    default:
      return 'queued';
  }
}

function mapFeedLevelToEventType(level: FeedEvent['level']) {
  switch (level) {
    case 'success':
      return 'campaign_updated' as const;
    case 'warn':
      return 'watchdog_stall_detected' as const;
    case 'error':
      return 'campaign_failed' as const;
    case 'info':
    default:
      return 'campaign_updated' as const;
  }
}

async function ensureDefaultAgents() {
  await db
    .insert(mcAgents)
    .values(
      DEFAULT_AGENTS.map((agent) => ({
        id: agent.id,
        name: agent.name,
        role: agent.domain,
        capabilities: agent.capabilities,
        status: 'active' as const,
        metadata: json({ ops: { seed: true, domain: agent.domain } }),
      }))
    )
    .onConflictDoNothing({ target: mcAgents.id });
}

async function loadCampaignBundle(campaignId?: string) {
  await ensureDefaultAgents();

  const campaigns = campaignId
    ? await db.select().from(mcCampaigns).where(eq(mcCampaigns.id, campaignId)).limit(1)
    : await db.select().from(mcCampaigns).orderBy(desc(mcCampaigns.createdAt));

  if (!campaigns.length) {
    return { campaigns: [], artifacts: [], blockers: [], events: [] };
  }

  const ids = campaigns.map((campaign) => campaign.id);
  const [artifacts, blockers, events] = await Promise.all([
    db.select().from(mcArtifacts).where(inArray(mcArtifacts.campaignId, ids)).orderBy(asc(mcArtifacts.createdAt)),
    db.select().from(mcBlockers).where(inArray(mcBlockers.campaignId, ids)).orderBy(desc(mcBlockers.createdAt)),
    db.select().from(mcEvents).where(inArray(mcEvents.campaignId, ids)).orderBy(desc(mcEvents.createdAt)),
  ]);

  return { campaigns, artifacts, blockers, events };
}

function serializeArtifact(row: typeof mcArtifacts.$inferSelect): CampaignArtifact {
  const ops = isRecord(row.metadata) && isRecord(row.metadata.ops) ? row.metadata.ops : {};
  const content = typeof ops.content === 'string' ? ops.content : row.contentSummary ?? '';
  const preview =
    content.length > 4096 ? `${content.slice(0, 4096)}\n\n_...truncated_` : content || row.contentSummary || '';

  return {
    name: row.title,
    size: asNumber(ops.contentSize, Buffer.byteLength(content || preview, 'utf8')),
    rows: typeof ops.rows === 'number' ? ops.rows : undefined,
    updatedAt: toIso(row.updatedAt),
    preview,
  };
}

function serializeBlocker(row: typeof mcBlockers.$inferSelect): CampaignBlocker {
  const ops = isRecord(row.metadata) && isRecord(row.metadata.ops) ? row.metadata.ops : {};
  return {
    type:
      typeof ops.type === 'string'
        ? ops.type
        : typeof row.summary === 'string'
          ? row.summary
          : 'BLOCKER',
    attempts: asNumber(
      ops.attempts,
      Array.isArray(row.fallbackAttempts) ? row.fallbackAttempts.length : 1
    ),
    requiredInput:
      typeof ops.requiredInput === 'string'
        ? ops.requiredInput
        : typeof row.requiredResolution === 'string'
          ? row.requiredResolution
          : '',
    detectedAt:
      typeof ops.detectedAt === 'string' ? ops.detectedAt : toIso(row.createdAt),
  };
}

function serializeFeedEvent(row: typeof mcEvents.$inferSelect): FeedEvent {
  const payload = isRecord(row.payload) ? row.payload : {};
  const level =
    payload.level === 'warn' || payload.level === 'error' || payload.level === 'success'
      ? payload.level
      : 'info';
  return {
    id: row.id,
    timestamp: toIso(row.createdAt),
    level,
    message: typeof row.message === 'string' ? row.message : '',
  };
}

function serializeCampaign(
  row: typeof mcCampaigns.$inferSelect,
  related: {
    artifacts: typeof mcArtifacts.$inferSelect[];
    blockers: typeof mcBlockers.$inferSelect[];
    events: typeof mcEvents.$inferSelect[];
  }
): Campaign {
  const ops = readOpsMetadata(row.metadata);
  const uiStatus = mapUiStatus(row.status as CampaignDbStatus, ops);
  const feed = related.events
    .filter((event) => event.campaignId === row.id)
    .slice(0, 200)
    .map(serializeFeedEvent);
  const artifacts = related.artifacts
    .filter((artifact) => artifact.campaignId === row.id)
    .map(serializeArtifact);
  const blockerRow = related.blockers.find(
    (blocker) => blocker.campaignId === row.id && ['open', 'in_review', 'stale'].includes(blocker.status)
  );

  return {
    id: row.id,
    name: row.name,
    objective: row.objective ?? row.description ?? '',
    leadAgentId: ops.leadAgentId ?? '',
    status: uiStatus,
    lastActivityAt: ops.lastActivityAt ?? toIso(row.updatedAt),
    startedAt: toIso(row.startedAt ?? row.createdAt),
    progress: ops.progress ?? 0,
    quickStats: ops.quickStats ?? { filesUpdated: 0, rowsProcessed: 0, batchCount: 0 },
    artifacts,
    blocker: blockerRow ? serializeBlocker(blockerRow) : null,
    feed,
    executionMode: ops.executionMode ?? 'STANDARD',
    minimumBatchSize: ops.minimumBatchSize ?? 5,
    requiredArtifacts: ops.requiredArtifacts ?? [],
  };
}

async function updateCampaignMetadata(
  campaignId: string,
  patch: Partial<OpsMetadata>,
  extra: Partial<{
    status: CampaignDbStatus;
    startedAt: Date | null;
    completedAt: Date | null;
    progressSummary: JsonValue;
  }> = {}
) {
  const [campaign] = await db.select().from(mcCampaigns).where(eq(mcCampaigns.id, campaignId)).limit(1);
  if (!campaign) return null;

  const nextOps = {
    ...readOpsMetadata(campaign.metadata),
    ...patch,
  };

  const now = new Date();
  await db
    .update(mcCampaigns)
    .set({
      status: extra.status ?? campaign.status,
      startedAt: extra.startedAt ?? campaign.startedAt,
      completedAt: extra.completedAt ?? campaign.completedAt,
      updatedAt: now,
      metadata: mergeOpsMetadata(campaign.metadata, nextOps),
      progressSummary: extra.progressSummary ?? buildProgressSummary(nextOps),
    })
    .where(eq(mcCampaigns.id, campaignId));

  return true;
}

async function appendCampaignEvent(
  campaignId: string,
  input: {
    level: FeedEvent['level'];
    message: string;
    createdAt?: Date;
    payload?: Record<string, unknown>;
    eventType?: (typeof mcEvents.$inferInsert)['eventType'];
  }
) {
  const [created] = await db
    .insert(mcEvents)
    .values({
      id: randomUUID(),
      campaignId,
      eventType: input.eventType ?? mapFeedLevelToEventType(input.level),
      message: input.message,
      payload: {
        level: input.level,
        source: 'ops',
        ...(input.payload ?? {}),
      },
      createdAt: input.createdAt ?? new Date(),
    })
    .returning();

  await updateCampaignMetadata(campaignId, {
    lastActivityAt: toIso(created.createdAt),
  });

  return created;
}

async function insertExecutionAttempt(
  campaignId: string,
  input: {
    status?: typeof mcExecutionAttempts.$inferSelect.status;
    executionMode?: typeof mcExecutionAttempts.$inferSelect.executionMode;
    gatewayRunId?: string | null;
    inputPayload?: JsonValue;
    outputPayload?: JsonValue;
    errorMessage?: string | null;
    metadata?: JsonValue;
  }
) {
  const rows = await db
    .select({ attemptNumber: mcExecutionAttempts.attemptNumber })
    .from(mcExecutionAttempts)
    .where(eq(mcExecutionAttempts.campaignId, campaignId))
    .orderBy(desc(mcExecutionAttempts.attemptNumber))
    .limit(1);
  const nextAttemptNumber = (rows[0]?.attemptNumber ?? 0) + 1;

  await db.insert(mcExecutionAttempts).values({
    id: randomUUID(),
    campaignId,
    attemptNumber: nextAttemptNumber,
    status: input.status ?? 'started',
    executionMode: input.executionMode ?? 'mixed',
    gatewayRunId: input.gatewayRunId ?? null,
    inputPayload: input.inputPayload ?? {},
    outputPayload: input.outputPayload ?? {},
    errorMessage: input.errorMessage ?? null,
    fallbackUsed: false,
    fallbackDetails: {},
    metadata: input.metadata ?? {},
  });
}

async function resolveOpenBlockers(campaignId: string) {
  await db
    .update(mcBlockers)
    .set({ status: 'resolved', resolvedAt: new Date() })
    .where(eq(mcBlockers.campaignId, campaignId));

  await db
    .update(mcResumeDirectives)
    .set({ status: 'consumed', consumedAt: new Date() })
    .where(eq(mcResumeDirectives.campaignId, campaignId));
}

export async function listAgents(): Promise<Agent[]> {
  await ensureDefaultAgents();
  const [agentRows, campaignRows] = await Promise.all([
    db.select().from(mcAgents).orderBy(asc(mcAgents.name)),
    db.select().from(mcCampaigns).orderBy(desc(mcCampaigns.updatedAt)),
  ]);

  return agentRows.map((agent) => {
    const activeCampaignIds = campaignRows
      .filter((campaign) => {
        const ops = readOpsMetadata(campaign.metadata);
        return ops.leadAgentId === agent.id && campaign.status === 'running';
      })
      .map((campaign) => campaign.id);
    const blocked = campaignRows.some((campaign) => {
      const ops = readOpsMetadata(campaign.metadata);
      return ops.leadAgentId === agent.id && campaign.status === 'blocked';
    });

    return {
      id: agent.id,
      name: agent.name,
      domain: agent.role ?? 'ops',
      capabilities: Array.isArray(agent.capabilities) ? agent.capabilities.map(String) : [],
      status: blocked ? 'BLOCKED' : activeCampaignIds.length > 0 ? 'RUNNING' : 'IDLE',
      activeCampaignIds,
    };
  });
}

export async function getAgent(id: string): Promise<Agent | undefined> {
  return (await listAgents()).find((agent) => agent.id === id);
}

export async function listCampaigns(): Promise<Campaign[]> {
  const bundle = await loadCampaignBundle();
  return bundle.campaigns.map((campaign) => serializeCampaign(campaign, bundle));
}

export async function getCampaign(id: string): Promise<Campaign | undefined> {
  const bundle = await loadCampaignBundle(id);
  const [campaign] = bundle.campaigns;
  return campaign ? serializeCampaign(campaign, bundle) : undefined;
}

export async function getCampaignFeed(id: string): Promise<FeedEvent[]> {
  await ensureDefaultAgents();
  const events = await db
    .select()
    .from(mcEvents)
    .where(eq(mcEvents.campaignId, id))
    .orderBy(desc(mcEvents.createdAt));
  return events.map(serializeFeedEvent);
}

export async function getCampaignArtifact(
  id: string,
  artifactName: string
): Promise<CampaignArtifact | undefined> {
  await ensureDefaultAgents();
  const [artifact] = await db
    .select()
    .from(mcArtifacts)
    .where(and(eq(mcArtifacts.campaignId, id), eq(mcArtifacts.title, artifactName)))
    .orderBy(desc(mcArtifacts.updatedAt))
    .limit(1);
  return artifact ? serializeArtifact(artifact) : undefined;
}

export async function getRunIdForCampaign(id: string): Promise<string | undefined> {
  const [campaign] = await db.select().from(mcCampaigns).where(eq(mcCampaigns.id, id)).limit(1);
  if (!campaign) return undefined;
  const ops = readOpsMetadata(campaign.metadata);
  return ops.workflowRunId ?? undefined;
}

export async function createCampaign(
  input: CreateCampaignInput,
  options?: { demo?: boolean }
): Promise<Campaign> {
  await ensureDefaultAgents();
  const now = new Date();
  const id = randomUUID();
  const quickStats: CampaignQuickStats = { filesUpdated: 0, rowsProcessed: 0, batchCount: 0 };
  const metadata = json({
    ops: {
      leadAgentId: input.leadAgentId,
      requiredArtifacts: input.requiredArtifacts,
      minimumBatchSize: input.minimumBatchSize,
      executionMode: input.executionMode,
      workflowRunId: null,
      demo: Boolean(options?.demo),
      quickStats,
      progress: 0,
      lastActivityAt: now.toISOString(),
    },
  });

  await db.transaction(async (tx) => {
    await tx.insert(mcCampaigns).values({
      id,
      name: input.name,
      description: input.objective,
      campaignType: 'general_execution',
      status: 'queued',
      priority: input.executionMode === 'AGGRESSIVE' ? 'high' : 'medium',
      objective: input.objective,
      successCriteria: input.requiredArtifacts.length ? { requiredArtifacts: input.requiredArtifacts } : null,
      progressMode: 'mixed',
      progressSummary: buildProgressSummary(readOpsMetadata(metadata)),
      createdBy: 'ops',
      createdAt: now,
      updatedAt: now,
      startedAt: now,
      metadata,
    });

    await tx.insert(mcCampaignAgents).values({
      id: randomUUID(),
      campaignId: id,
      agentId: input.leadAgentId,
      assignmentRole: 'owner',
      isPrimary: true,
      metadata: json({ ops: { leadAgentId: input.leadAgentId } }),
    });

    await tx.insert(mcExecutionAttempts).values({
      id: randomUUID(),
      campaignId: id,
      attemptNumber: 1,
      status: 'started',
      executionMode: 'mixed',
      gatewayRunId: null,
      startedAt: now,
      inputPayload: {
        name: input.name,
        objective: input.objective,
        leadAgentId: input.leadAgentId,
        requiredArtifacts: input.requiredArtifacts,
        minimumBatchSize: input.minimumBatchSize,
        executionMode: input.executionMode,
      },
      outputPayload: {},
      fallbackUsed: false,
      fallbackDetails: {},
      metadata: json({ ops: { demo: Boolean(options?.demo) } }),
    });
  });

  await appendCampaignEvent(id, {
    level: 'info',
    message: `Mission queued · mode=${input.executionMode.toLowerCase()} · agent=${input.leadAgentId.replace('agent_', '')}`,
  });

  const campaign = await getCampaign(id);
  if (!campaign) {
    throw new Error('Failed to hydrate campaign after creation');
  }
  return campaign;
}

export async function setCampaignRunId(campaignId: string, runId: string): Promise<void> {
  const [campaign] = await db.select().from(mcCampaigns).where(eq(mcCampaigns.id, campaignId)).limit(1);
  if (!campaign) return;
  const ops = readOpsMetadata(campaign.metadata);
  await db
    .update(mcCampaigns)
    .set({
      metadata: mergeOpsMetadata(campaign.metadata, {
        ...ops,
        workflowRunId: runId,
        lastActivityAt: new Date().toISOString(),
      }),
      updatedAt: new Date(),
      progressSummary: buildProgressSummary({
        ...ops,
        workflowRunId: runId,
        lastActivityAt: new Date().toISOString(),
      }),
    })
    .where(eq(mcCampaigns.id, campaignId));

  const latestAttempt = await db
    .select()
    .from(mcExecutionAttempts)
    .where(eq(mcExecutionAttempts.campaignId, campaignId))
    .orderBy(desc(mcExecutionAttempts.startedAt))
    .limit(1);
  if (latestAttempt[0]) {
    await db
      .update(mcExecutionAttempts)
      .set({ gatewayRunId: runId, status: 'running' })
      .where(eq(mcExecutionAttempts.id, latestAttempt[0].id));
  }
}

export async function setCampaignStatus(
  campaignId: string,
  status: CampaignStatus
): Promise<void> {
  const [campaign] = await db.select().from(mcCampaigns).where(eq(mcCampaigns.id, campaignId)).limit(1);
  if (!campaign) return;
  const now = new Date();
  const ops = readOpsMetadata(campaign.metadata);
  const nextOps: OpsMetadata = {
    ...ops,
    lastActivityAt: now.toISOString(),
    terminalStatus: status === 'CANCELLED' ? 'CANCELLED' : status === 'FAILED' ? 'FAILED' : null,
  };

  await db
    .update(mcCampaigns)
    .set({
      status: mapDbStatus(status),
      completedAt: status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED' ? now : campaign.completedAt,
      updatedAt: now,
      metadata: mergeOpsMetadata(campaign.metadata, nextOps),
      progressSummary: buildProgressSummary(nextOps),
    })
    .where(eq(mcCampaigns.id, campaignId));

  const latestAttempt = await db
    .select()
    .from(mcExecutionAttempts)
    .where(eq(mcExecutionAttempts.campaignId, campaignId))
    .orderBy(desc(mcExecutionAttempts.startedAt))
    .limit(1);
  if (latestAttempt[0]) {
    const attemptStatus =
      status === 'COMPLETED'
        ? 'succeeded'
        : status === 'FAILED'
          ? 'failed'
          : status === 'CANCELLED'
            ? 'cancelled'
            : status === 'BLOCKED'
              ? 'stalled'
              : 'running';
    await db
      .update(mcExecutionAttempts)
      .set({ status: attemptStatus })
      .where(eq(mcExecutionAttempts.id, latestAttempt[0].id));
  }
}

export async function setCampaignProgress(campaignId: string, progress: number): Promise<void> {
  const [campaign] = await db.select().from(mcCampaigns).where(eq(mcCampaigns.id, campaignId)).limit(1);
  if (!campaign) return;
  const ops = readOpsMetadata(campaign.metadata);
  const nextOps: OpsMetadata = {
    ...ops,
    progress: Math.max(0, Math.min(1, progress)),
    lastActivityAt: new Date().toISOString(),
  };
  await db
    .update(mcCampaigns)
    .set({
      updatedAt: new Date(),
      metadata: mergeOpsMetadata(campaign.metadata, nextOps),
      progressSummary: buildProgressSummary(nextOps),
    })
    .where(eq(mcCampaigns.id, campaignId));
}

export async function setCampaignBlocker(
  campaignId: string,
  blocker: CampaignBlocker | null
): Promise<void> {
  const [campaign] = await db.select().from(mcCampaigns).where(eq(mcCampaigns.id, campaignId)).limit(1);
  if (!campaign) return;
  const now = new Date();
  const ops = readOpsMetadata(campaign.metadata);

  if (!blocker) {
    await resolveOpenBlockers(campaignId);
    await db
      .update(mcCampaigns)
      .set({
        updatedAt: now,
        metadata: mergeOpsMetadata(campaign.metadata, {
          ...ops,
          lastActivityAt: now.toISOString(),
        }),
        progressSummary: buildProgressSummary({
          ...ops,
          lastActivityAt: now.toISOString(),
        }),
      })
      .where(eq(mcCampaigns.id, campaignId));
    return;
  }

  const existing = await db
    .select()
    .from(mcBlockers)
    .where(eq(mcBlockers.campaignId, campaignId))
    .orderBy(desc(mcBlockers.createdAt))
    .limit(1);

  const blockerPayload = {
    ops: {
      type: blocker.type,
      attempts: blocker.attempts,
      requiredInput: blocker.requiredInput,
      detectedAt: blocker.detectedAt,
    },
  };

  if (existing[0]) {
    await db
      .update(mcBlockers)
      .set({
        summary: blocker.type,
        details: blocker.requiredInput || null,
        severity: 'high',
        status: 'open',
        requiredResolution: blocker.requiredInput || null,
        resolvedAt: null,
        metadata: json(blockerPayload),
      })
      .where(eq(mcBlockers.id, existing[0].id));
  } else {
    await db.insert(mcBlockers).values({
      id: randomUUID(),
      campaignId,
      summary: blocker.type,
      details: blocker.requiredInput || null,
      severity: 'high',
      status: 'open',
      requiredResolution: blocker.requiredInput || null,
      canContinueElsewhere: false,
      createdAt: now,
      metadata: json(blockerPayload),
    });
  }

  await db.insert(mcResumeDirectives).values({
    id: randomUUID(),
    campaignId,
    nextExecutableAction: blocker.requiredInput
      ? `collect required input: ${blocker.requiredInput}`
      : 'review blocker and resume',
    approvalRequired: Boolean(blocker.requiredInput),
    status: 'open',
    createdAt: now,
    metadata: json({
      ops: {
        blocker,
      },
    }),
  });

  await db
    .update(mcCampaigns)
    .set({
      status: 'blocked',
      updatedAt: now,
      metadata: mergeOpsMetadata(campaign.metadata, {
        ...ops,
        lastActivityAt: now.toISOString(),
      }),
      progressSummary: buildProgressSummary({
        ...ops,
        lastActivityAt: now.toISOString(),
      }),
    })
    .where(eq(mcCampaigns.id, campaignId));

  await insertExecutionAttempt(campaignId, {
    status: 'stalled',
    executionMode: 'mixed',
    inputPayload: json({ blocker }),
    metadata: json({ ops: { blocker } }),
  });
}

export async function recordEvent(
  campaignId: string,
  event: { level: FeedEvent['level']; message: string }
): Promise<FeedEvent | undefined> {
  const [campaign] = await db.select().from(mcCampaigns).where(eq(mcCampaigns.id, campaignId)).limit(1);
  if (!campaign) return undefined;

  const created = await appendCampaignEvent(campaignId, event);
  return {
    id: created.id,
    timestamp: toIso(created.createdAt),
    level: event.level,
    message: event.message,
  };
}

export async function upsertArtifact(
  campaignId: string,
  artifact: { name: string; content: string; rows?: number }
): Promise<CampaignArtifact | undefined> {
  const [campaign] = await db.select().from(mcCampaigns).where(eq(mcCampaigns.id, campaignId)).limit(1);
  if (!campaign) return undefined;
  const now = new Date();
  const existing = await db
    .select()
    .from(mcArtifacts)
    .where(eq(mcArtifacts.campaignId, campaignId))
    .orderBy(asc(mcArtifacts.createdAt))
    .limit(200);
  const preview =
    artifact.content.length > 4096
      ? `${artifact.content.slice(0, 4096)}\n\n_...truncated_`
      : artifact.content;
  const artifactMetadata = {
    ops: {
      content: artifact.content,
      contentSize: Buffer.byteLength(artifact.content, 'utf8'),
      rows: artifact.rows ?? null,
      preview,
    },
  };

  const existingRow = existing.find((row) => row.title === artifact.name);
  if (existingRow) {
    await db
      .update(mcArtifacts)
      .set({
        updatedAt: now,
        contentSummary: preview,
        metadata: artifactMetadata,
      })
      .where(eq(mcArtifacts.id, existingRow.id));
  } else {
    await db.insert(mcArtifacts).values({
      id: randomUUID(),
      campaignId,
      artifactType: 'markdown',
      title: artifact.name,
      description: null,
      contentSummary: preview,
      validationStatus: 'needs_review',
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
      metadata: artifactMetadata,
    });
  }

  const nextFilesUpdated = existingRow ? existing.length : existing.length + 1;
  const ops = readOpsMetadata(campaign.metadata);
  const nextOps: OpsMetadata = {
    ...ops,
    quickStats: {
      filesUpdated: nextFilesUpdated,
      rowsProcessed: typeof artifact.rows === 'number' ? artifact.rows : ops.quickStats?.rowsProcessed ?? 0,
      batchCount: ops.quickStats?.batchCount ?? 0,
    },
    lastActivityAt: now.toISOString(),
  };

  await db
    .update(mcCampaigns)
    .set({
      updatedAt: now,
      metadata: mergeOpsMetadata(campaign.metadata, nextOps),
      progressSummary: buildProgressSummary(nextOps),
    })
    .where(eq(mcCampaigns.id, campaignId));

  await appendCampaignEvent(campaignId, {
    level: 'success',
    message: `Wrote ${artifact.name} (${Buffer.byteLength(artifact.content, 'utf8')} bytes${
      artifact.rows ? `, ${artifact.rows} rows` : ''
    })`,
  });

  return {
    name: artifact.name,
    size: Buffer.byteLength(artifact.content, 'utf8'),
    rows: artifact.rows,
    updatedAt: now.toISOString(),
    preview,
  };
}

export async function incrementBatchCount(campaignId: string): Promise<void> {
  const [campaign] = await db.select().from(mcCampaigns).where(eq(mcCampaigns.id, campaignId)).limit(1);
  if (!campaign) return;
  const ops = readOpsMetadata(campaign.metadata);
  const nextOps: OpsMetadata = {
    ...ops,
    quickStats: {
      filesUpdated: ops.quickStats?.filesUpdated ?? 0,
      rowsProcessed: ops.quickStats?.rowsProcessed ?? 0,
      batchCount: (ops.quickStats?.batchCount ?? 0) + 1,
    },
    lastActivityAt: new Date().toISOString(),
  };

  await db
    .update(mcCampaigns)
    .set({
      updatedAt: new Date(),
      metadata: mergeOpsMetadata(campaign.metadata, nextOps),
      progressSummary: buildProgressSummary(nextOps),
    })
    .where(eq(mcCampaigns.id, campaignId));
}

export async function applyControl(
  campaignId: string,
  action: CampaignControlAction
): Promise<Campaign | undefined> {
  const current = await getCampaign(campaignId);
  if (!current) return undefined;

  switch (action) {
    case 'resume':
      await resolveOpenBlockers(campaignId);
      await setCampaignStatus(campaignId, 'RUNNING');
      await appendCampaignEvent(campaignId, {
        level: 'success',
        message: 'Execution resumed by operator',
      });
      await insertExecutionAttempt(campaignId, {
        status: 'resumed',
        executionMode: 'mixed',
        inputPayload: { action: 'resume' },
      });
      break;
    case 'force_retry':
      await setCampaignStatus(campaignId, 'RUNNING');
      await appendCampaignEvent(campaignId, {
        level: 'info',
        message: 'Force retry issued',
      });
      await insertExecutionAttempt(campaignId, {
        status: 'resumed',
        executionMode: 'mixed',
        inputPayload: { action: 'force_retry' },
      });
      break;
    case 'approve_action':
      await setCampaignStatus(campaignId, 'RUNNING');
      await appendCampaignEvent(campaignId, {
        level: 'success',
        message: 'Operator approved pending action',
      });
      break;
    case 'escalate':
      await appendCampaignEvent(campaignId, {
        level: 'warn',
        message: 'Escalated to human review',
      });
      await db.insert(mcResumeDirectives).values({
        id: randomUUID(),
        campaignId,
        nextExecutableAction: 'human review requested',
        approvalRequired: true,
        status: 'open',
        createdAt: new Date(),
        metadata: json({ ops: { source: 'operator_escalation' } }),
      });
      break;
    case 'kill':
      await resolveOpenBlockers(campaignId);
      await setCampaignStatus(campaignId, 'CANCELLED');
      await appendCampaignEvent(campaignId, {
        level: 'error',
        message: 'Mission cancelled by operator',
      });
      break;
  }

  return await getCampaign(campaignId);
}

export function getSystemRules(): SystemRules {
  return { ...systemRules };
}

export function updateSystemRules(patch: Partial<SystemRules>): SystemRules {
  systemRules = { ...systemRules, ...patch };
  return { ...systemRules };
}

export async function getWatchdogState(): Promise<WatchdogState> {
  const campaigns = await listCampaigns();
  const inProgress = campaigns
    .filter((campaign) => campaign.status === 'RUNNING' || campaign.status === 'DEPLOYING' || campaign.status === 'BLOCKED')
    .map((campaign) => ({
      campaignId: campaign.id,
      name: campaign.name,
      leadAgentName: (DEFAULT_AGENTS.find((agent) => agent.id === campaign.leadAgentId)?.name ?? 'Unassigned'),
      lastActivityAt: campaign.lastActivityAt,
      isStale: (Date.now() - new Date(campaign.lastActivityAt).getTime()) / 60_000 > STALE_MINUTES,
      isMissingArtifacts: campaign.requiredArtifacts.some(
        (required) => !campaign.artifacts.find((artifact) => artifact.name === required)
      ),
      hasInvalidBlocker:
        !!campaign.blocker &&
        campaign.blocker.attempts >= systemRules.blockerThreshold &&
        !campaign.blocker.requiredInput,
    }));

  return { inProgress, staleThresholdMinutes: STALE_MINUTES };
}

export async function forceResumeAll(): Promise<number> {
  const campaigns = await listCampaigns();
  let count = 0;
  for (const campaign of campaigns) {
    if (campaign.status === 'BLOCKED') {
      await resolveOpenBlockers(campaign.id);
      await setCampaignStatus(campaign.id, 'RUNNING');
      await appendCampaignEvent(campaign.id, {
        level: 'success',
        message: 'Watchdog: force-resume',
      });
      count += 1;
    }
  }
  return count;
}

export async function escalateAllBlockers(): Promise<number> {
  const campaigns = await listCampaigns();
  let count = 0;
  for (const campaign of campaigns) {
    if (campaign.blocker) {
      await appendCampaignEvent(campaign.id, {
        level: 'warn',
        message: `Watchdog: escalated blocker (${campaign.blocker.type})`,
      });
      await db.insert(mcResumeDirectives).values({
        id: randomUUID(),
        campaignId: campaign.id,
        nextExecutableAction: `review blocker: ${campaign.blocker.type}`,
        approvalRequired: Boolean(campaign.blocker.requiredInput),
        status: 'open',
        createdAt: new Date(),
        metadata: json({ ops: { blocker: campaign.blocker, source: 'watchdog' } }),
      });
      count += 1;
    }
  }
  return count;
}

export async function seedDemoMissions(): Promise<{ created: string[] }> {
  await resetDemoMissions();
  const created: string[] = [];

  const m1 = await createCampaign(
    {
      name: 'Demo: Shopify Catalog Audit',
      objective:
        'Audit live Shopify catalog for missing alt text, broken variant links, and pricing drift. Produce per-product diff and a remediation queue.',
      leadAgentId: DEFAULT_AGENTS[0].id,
      requiredArtifacts: ['products.md', 'action-log.md'],
      minimumBatchSize: 5,
      executionMode: 'STANDARD',
    },
    { demo: true }
  );
  await setCampaignStatus(m1.id, 'RUNNING');
  await setCampaignProgress(m1.id, 0.62);
  await upsertArtifact(m1.id, {
    name: 'products.md',
    rows: 184,
    content: ['# Catalog Audit · Products', '', '_184 products scanned · 23 issues flagged_', '', '| SKU | Issue | Severity |'].join('\n'),
  });
  await upsertArtifact(m1.id, {
    name: 'action-log.md',
    rows: 4,
    content: ['# Action Log', '', '- Pulled 184 products from Storefront API', '- Ran alt-text checker', '- Ran variant link probe', '- Detected 6 high-severity issues'].join('\n'),
  });
  created.push(m1.id);

  const m2 = await createCampaign(
    {
      name: 'Demo: Finance Recon (Apr 2026)',
      objective:
        'Reconcile April expense ledger against Plaid feed. Flag merchant overlaps and propose subscription cancellations needing operator approval.',
      leadAgentId: DEFAULT_AGENTS[3].id,
      requiredArtifacts: ['ledger-diff.md', 'blockers.md'],
      minimumBatchSize: 5,
      executionMode: 'STANDARD',
    },
    { demo: true }
  );
  await setCampaignStatus(m2.id, 'BLOCKED');
  await setCampaignProgress(m2.id, 0.48);
  await setCampaignBlocker(m2.id, {
    type: 'pending_input',
    attempts: 1,
    requiredInput: 'approve | deny',
    detectedAt: new Date().toISOString(),
  });
  await upsertArtifact(m2.id, {
    name: 'ledger-diff.md',
    rows: 89,
    content: ['# April Reconciliation Diff', '', '_89 transactions reconciled · 4 unresolved · 2 awaiting approval_'].join('\n'),
  });
  created.push(m2.id);

  const m3 = await createCampaign(
    {
      name: 'Demo: Mothership Deploy v0.142.0',
      objective:
        'Build, gate, and deploy mothership v0.142.0. Generate release notes, run smoke tests, and post deploy receipt.',
      leadAgentId: DEFAULT_AGENTS[2].id,
      requiredArtifacts: ['release-notes.md', 'action-log.md'],
      minimumBatchSize: 1,
      executionMode: 'STANDARD',
    },
    { demo: true }
  );
  await setCampaignStatus(m3.id, 'COMPLETED');
  await setCampaignProgress(m3.id, 1);
  await upsertArtifact(m3.id, {
    name: 'release-notes.md',
    rows: 12,
    content: ['# v0.142.0', '', '## Highlights', '', '- Added /ops mission control surface'].join('\n'),
  });
  await upsertArtifact(m3.id, {
    name: 'action-log.md',
    rows: 6,
    content: ['# Deploy Action Log', '', '- pre-flight · type check passed', '- build · next build complete', '- deploy · promoted to production'].join('\n'),
  });
  created.push(m3.id);

  return { created };
}

export async function resetDemoMissions(): Promise<{ removed: number }> {
  await ensureDefaultAgents();
  const campaigns = await db.select().from(mcCampaigns).orderBy(desc(mcCampaigns.createdAt));
  const demoCampaignIds = campaigns
    .filter((campaign) => readOpsMetadata(campaign.metadata).demo || campaign.name.startsWith('Demo:'))
    .map((campaign) => campaign.id);

  if (!demoCampaignIds.length) {
    return { removed: 0 };
  }

  await db.delete(mcCampaigns).where(inArray(mcCampaigns.id, demoCampaignIds));
  return { removed: demoCampaignIds.length };
}

export async function getTickerSummary(): Promise<OpsTickerSummary> {
  const campaigns = await listCampaigns();
  const active = campaigns.filter((campaign) => campaign.status === 'RUNNING' || campaign.status === 'DEPLOYING').length;
  const blocked = campaigns.filter((campaign) => campaign.status === 'BLOCKED').length;
  const entries = campaigns.map((campaign) => {
    const label =
      campaign.status === 'RUNNING'
        ? `${campaign.name}: Running`
        : campaign.status === 'BLOCKED'
          ? `${campaign.name}: Blocked`
          : campaign.status === 'IDLE'
            ? `${campaign.name}: Queued`
            : campaign.status === 'DEPLOYING'
              ? `${campaign.name}: Deploying`
              : `${campaign.name}: Completed`;
    const status: 'OK' | 'WARN' | 'CRIT' =
      campaign.status === 'BLOCKED' ? 'CRIT' : campaign.status === 'IDLE' ? 'WARN' : 'OK';
    return { label, status };
  });

  entries.push({
    label: campaigns.length === 0 ? 'No active missions' : 'Watchdog: Active',
    status: 'OK',
  });

  return { activeCampaigns: active, blockedCampaigns: blocked, entries };
}
