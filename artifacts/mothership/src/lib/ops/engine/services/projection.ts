// Project the durable mc* rows into the legacy UI Campaign / Agent shapes
// expected by the existing /ops UI. This is a backward-compatibility layer
// so the engine can ship without touching any component code.

import { listEvents } from './events';
import { listArtifacts } from './artifacts';
import { listOpenBlockers } from './blockers';
import {
  getPrimaryAgentId,
  listCampaigns,
  type CreateCampaignArgs,
} from './campaigns';
import { listAgents } from './agents';
import {
  type CampaignStatus as DbCampaignStatus,
  type McAgent,
  type McCampaign,
} from '../../../db/dispatch-schema';
import type {
  Agent as UiAgent,
  Campaign as UiCampaign,
  CampaignArtifact as UiArtifact,
  CampaignBlocker as UiBlocker,
  CampaignStatus as UiCampaignStatus,
  CreateCampaignInput as UiCreateCampaignInput,
  ExecutionMode as UiExecutionMode,
  FeedEvent as UiFeedEvent,
  OpsTickerEntry,
  OpsTickerSummary,
} from '../../types';

export function dbToUiStatus(s: DbCampaignStatus): UiCampaignStatus {
  switch (s) {
    case 'running': return 'RUNNING';
    case 'blocked': return 'BLOCKED';
    case 'completed': return 'COMPLETED';
    case 'failed': return 'FAILED';
    case 'archived': return 'CANCELLED';
    case 'paused':
    case 'waiting_for_approval':
    case 'draft':
    case 'approved':
    case 'queued':
    default:
      return 'IDLE';
  }
}

export function uiToDbStatus(s: UiCampaignStatus): DbCampaignStatus {
  switch (s) {
    case 'RUNNING': return 'running';
    case 'BLOCKED': return 'blocked';
    case 'COMPLETED': return 'completed';
    case 'FAILED': return 'failed';
    case 'CANCELLED': return 'archived';
    case 'DEPLOYING': return 'running';
    case 'IDLE':
    default:
      return 'queued';
  }
}

function eventLevelFor(eventType: string): UiFeedEvent['level'] {
  if (eventType === 'campaign_completed' || eventType === 'execution_progress' || eventType === 'artifact_created' || eventType === 'artifact_updated') {
    return 'success';
  }
  if (eventType.startsWith('blocker_') || eventType === 'execution_failed' || eventType === 'campaign_failed') {
    return eventType === 'blocker_resolved' ? 'success' : 'error';
  }
  if (eventType === 'campaign_paused' || eventType === 'watchdog_stall_detected' || eventType === 'approval_requested') {
    return 'warn';
  }
  return 'info';
}

export function agentToUi(a: McAgent, activeCampaignIds: string[], blocked: boolean): UiAgent {
  return {
    id: a.id,
    name: a.name,
    domain: a.role ?? '—',
    capabilities: Array.isArray(a.capabilities) ? (a.capabilities as string[]) : [],
    status: blocked ? 'BLOCKED' : activeCampaignIds.length > 0 ? 'RUNNING' : 'IDLE',
    activeCampaignIds,
  };
}

export async function projectCampaign(c: McCampaign): Promise<UiCampaign> {
  const [events, artifacts, blockers, leadAgentId] = await Promise.all([
    listEvents(c.id, 200),
    listArtifacts(c.id),
    listOpenBlockers(c.id),
    getPrimaryAgentId(c.id),
  ]);

  const feed: UiFeedEvent[] = events.map((e) => ({
    id: e.id,
    timestamp: e.createdAt.toISOString(),
    level: eventLevelFor(e.eventType),
    message: e.message ?? e.eventType,
  }));

  const uiArtifacts: UiArtifact[] = artifacts.map((a) => ({
    name: a.title,
    size: typeof (a.metadata as { sizeBytes?: number })?.sizeBytes === 'number'
      ? (a.metadata as { sizeBytes?: number }).sizeBytes!
      : (a.contentSummary?.length ?? 0),
    rows: undefined,
    updatedAt: a.updatedAt.toISOString(),
    preview: a.contentSummary ?? '',
  }));

  const blocker: UiBlocker | null = blockers[0]
    ? {
        type: blockers[0].attemptedMethod ?? 'tool_failure',
        attempts: 1,
        requiredInput: blockers[0].requiredResolution ?? 'operator_review',
        detectedAt: blockers[0].createdAt.toISOString(),
      }
    : null;

  const progressSummary = (c.progressSummary as
    | { progress?: number; filesUpdated?: number; rowsProcessed?: number; batchCount?: number }
    | null) ?? {};

  const meta = (c.metadata as Record<string, unknown> | null) ?? {};
  const requiredArtifacts = Array.isArray(meta.requiredArtifacts)
    ? (meta.requiredArtifacts as string[])
    : [];
  const minimumBatchSize = typeof meta.minimumBatchSize === 'number' ? meta.minimumBatchSize : 1;
  const executionMode: UiExecutionMode =
    meta.executionMode === 'AGGRESSIVE' ? 'AGGRESSIVE' : 'STANDARD';

  const lastActivity = events[0]?.createdAt ?? c.updatedAt;

  return {
    id: c.id,
    name: c.name,
    objective: c.description ?? c.objective ?? '',
    leadAgentId: leadAgentId ?? '',
    status: dbToUiStatus(c.status),
    lastActivityAt: lastActivity.toISOString(),
    startedAt: (c.startedAt ?? c.createdAt).toISOString(),
    progress: typeof progressSummary.progress === 'number' ? progressSummary.progress : 0,
    quickStats: {
      filesUpdated: progressSummary.filesUpdated ?? uiArtifacts.length,
      rowsProcessed: progressSummary.rowsProcessed ?? 0,
      batchCount: progressSummary.batchCount ?? 0,
    },
    artifacts: uiArtifacts,
    blocker,
    feed,
    executionMode,
    minimumBatchSize,
    requiredArtifacts,
  };
}

export async function projectAllCampaigns(): Promise<UiCampaign[]> {
  const rows = await listCampaigns();
  return Promise.all(rows.map(projectCampaign));
}

export async function projectAllAgents(): Promise<UiAgent[]> {
  const [agents, campaigns] = await Promise.all([listAgents(), listCampaigns()]);
  return Promise.all(
    agents.map(async (a) => {
      const campaignsForAgent: McCampaign[] = [];
      for (const c of campaigns) {
        const lead = await getPrimaryAgentId(c.id);
        if (lead === a.id) campaignsForAgent.push(c);
      }
      const activeCampaignIds = campaignsForAgent
        .filter((c) => c.status === 'running')
        .map((c) => c.id);
      const blocked = campaignsForAgent.some((c) => c.status === 'blocked');
      return agentToUi(a, activeCampaignIds, blocked);
    }),
  );
}

export function tickerFromCampaigns(campaigns: UiCampaign[]): OpsTickerSummary {
  const active = campaigns.filter((c) => c.status === 'RUNNING' || c.status === 'DEPLOYING').length;
  const blocked = campaigns.filter((c) => c.status === 'BLOCKED').length;
  const entries: OpsTickerEntry[] = campaigns.map((c) => {
    const label =
      c.status === 'RUNNING' ? `${c.name}: Running`
      : c.status === 'BLOCKED' ? `${c.name}: Blocked`
      : c.status === 'IDLE' ? `${c.name}: Queued`
      : c.status === 'DEPLOYING' ? `${c.name}: Deploying`
      : `${c.name}: ${c.status.toLowerCase()}`;
    const status: 'OK' | 'WARN' | 'CRIT' =
      c.status === 'BLOCKED' || c.status === 'FAILED' ? 'CRIT'
      : c.status === 'IDLE' ? 'WARN'
      : 'OK';
    return { label, status };
  });
  entries.push({
    label: campaigns.length === 0 ? 'No active missions' : 'Watchdog: Active',
    status: 'OK',
  });
  return { activeCampaigns: active, blockedCampaigns: blocked, entries };
}

export function uiCreateInputToDb(input: UiCreateCampaignInput): CreateCampaignArgs {
  return {
    name: input.name,
    description: input.objective,
    objective: input.objective,
    campaignType: 'general_execution',
    status: 'queued',
    priority: 'medium',
    progressMode: 'mixed',
    leadAgentId: input.leadAgentId || undefined,
    metadata: {
      requiredArtifacts: input.requiredArtifacts,
      minimumBatchSize: input.minimumBatchSize,
      executionMode: input.executionMode,
    },
  };
}
