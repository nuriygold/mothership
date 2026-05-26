import { Buffer } from 'node:buffer';
import { DispatchCampaignStatus, DispatchTaskStatus } from '../../db/enums';
import type { JsonValue } from '../../db/json';
import type { McCampaign } from '../../db/dispatch-schema';
import {
  approveDispatchPlan,
  createDispatchCampaign,
  enqueueDispatchCampaign,
  generateDispatchPlans,
  getDispatchCampaign,
  runDispatchCampaign,
  type DispatchSyncReason,
} from '../../services/dispatch';
import { getArtifactByTitle, writeArtifact } from './services/artifacts';
import { createBlocker, listOpenBlockers, resolveBlocker } from './services/blockers';
import {
  getCampaign,
  mergeMetadata,
  setProgressSummary,
  setStatus,
} from './services/campaigns';
import { record } from './services/events';

type DispatchTaskSummary = {
  planned: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
  canceled: number;
  total: number;
};

type BoundDispatchCampaign = NonNullable<Awaited<ReturnType<typeof getDispatchCampaign>>>;

type DispatchBinding = {
  backend: 'dispatch';
  lifecycleContractVersion: string;
  dispatchCampaignId: string;
  dispatchStatus?: string;
  durableStatus?: string;
  taskSummary?: DispatchTaskSummary;
  lastSyncedAt?: string;
};

const CONTRACT_VERSION = '2026-05-26';

export const OPS_DISPATCH_LIFECYCLE_CONTRACT = {
  version: CONTRACT_VERSION,
  dispatchToDurable: {
    PLANNED: { durableStatus: 'queued', durableEvent: 'dispatch_task_planned' },
    QUEUED: { durableStatus: 'queued', durableEvent: 'dispatch_task_queued' },
    RUNNING: { durableStatus: 'running', durableEvent: 'dispatch_task_started' },
    DONE: { durableStatus: 'running', durableEvent: 'dispatch_task_completed' },
    FAILED: { durableStatus: 'blocked', durableEvent: 'dispatch_task_failed' },
    CANCELED: { durableStatus: 'archived', durableEvent: 'dispatch_task_canceled' },
    ALL_REQUIRED_DONE: { durableStatus: 'completed', durableEvent: 'campaign_completed' },
    REQUIRED_TASK_FAILED: { durableStatus: 'blocked', durableEvent: 'campaign_blocked' },
  },
} as const;

function baseMetadata(campaign: McCampaign) {
  return ((campaign.metadata as Record<string, unknown> | null) ?? {});
}

function getDispatchBinding(campaign: McCampaign): DispatchBinding | null {
  const metadata = baseMetadata(campaign);
  const raw = metadata.dispatchBinding;
  if (!raw || typeof raw !== 'object') return null;
  const binding = raw as Record<string, unknown>;
  if (binding.backend !== 'dispatch') return null;
  if (typeof binding.dispatchCampaignId !== 'string') return null;
  return binding as unknown as DispatchBinding;
}

export function isDispatchBackedCampaign(campaign: McCampaign): boolean {
  const metadata = baseMetadata(campaign);
  return metadata.executionBackend === 'dispatch' || getDispatchBinding(campaign) !== null;
}

function summarizeDispatchTasks(dispatchCampaign: BoundDispatchCampaign): DispatchTaskSummary {
  const summary: DispatchTaskSummary = {
    planned: 0,
    queued: 0,
    running: 0,
    done: 0,
    failed: 0,
    canceled: 0,
    total: dispatchCampaign.tasks.length,
  };

  for (const task of dispatchCampaign.tasks) {
    switch (task.status) {
      case DispatchTaskStatus.PLANNED:
        summary.planned += 1;
        break;
      case DispatchTaskStatus.QUEUED:
        summary.queued += 1;
        break;
      case DispatchTaskStatus.RUNNING:
        summary.running += 1;
        break;
      case DispatchTaskStatus.DONE:
        summary.done += 1;
        break;
      case DispatchTaskStatus.FAILED:
        summary.failed += 1;
        break;
      case DispatchTaskStatus.CANCELED:
        summary.canceled += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

function mapDispatchCampaignToDurableStatus(
  dispatchCampaign: BoundDispatchCampaign,
  summary: DispatchTaskSummary,
): 'queued' | 'running' | 'blocked' | 'completed' {
  if (
    dispatchCampaign.status === DispatchCampaignStatus.COMPLETED &&
    summary.failed === 0 &&
    summary.total > 0 &&
    summary.done + summary.canceled >= summary.total
  ) {
    return 'completed';
  }

  if (
    dispatchCampaign.status === DispatchCampaignStatus.PAUSED ||
    summary.failed > 0
  ) {
    return 'blocked';
  }

  if (
    dispatchCampaign.status === DispatchCampaignStatus.EXECUTING ||
    summary.running > 0 ||
    summary.done > 0
  ) {
    return 'running';
  }

  return 'queued';
}

function progressFromSummary(summary: DispatchTaskSummary): number {
  if (summary.total === 0) return 0;
  return Math.max(
    0,
    Math.min(1, (summary.done + summary.canceled) / summary.total),
  );
}

async function ensureDispatchTaskArtifacts(
  opsCampaignId: string,
  dispatchCampaignId: string,
  dispatchCampaign: BoundDispatchCampaign,
) {
  for (const task of dispatchCampaign.tasks) {
    if (task.status !== DispatchTaskStatus.DONE || !task.output?.trim()) continue;
    const title = `dispatch-task-${task.key || task.id}.md`;
    const existing = await getArtifactByTitle(opsCampaignId, title);
    const contentSummary = task.output.trim();
    const metadata = {
      source: 'dispatch',
      dispatchCampaignId,
      dispatchTaskId: task.id,
      dispatchTaskStatus: task.status,
      dispatchTaskTitle: task.title,
      sizeBytes: Buffer.byteLength(contentSummary, 'utf8'),
    } satisfies Record<string, unknown>;

    if (
      existing &&
      existing.contentSummary === contentSummary &&
      JSON.stringify(existing.metadata ?? {}) === JSON.stringify(metadata)
    ) {
      continue;
    }

    await writeArtifact({
      campaignId: opsCampaignId,
      artifactType: 'markdown',
      title,
      description: `Dispatch task output: ${task.title}`,
      contentSummary,
      metadata,
    });
  }
}

async function syncDispatchBlockers(
  opsCampaignId: string,
  dispatchCampaignId: string,
  dispatchCampaign: BoundDispatchCampaign,
  summary: DispatchTaskSummary,
) {
  const open = await listOpenBlockers(opsCampaignId);
  const dispatchOpen = open.filter((blocker) => {
    const metadata = (blocker.metadata as Record<string, unknown> | null) ?? {};
    return metadata.source === 'dispatch' && metadata.dispatchCampaignId === dispatchCampaignId;
  });

  if (summary.failed === 0) {
    for (const blocker of dispatchOpen) {
      await resolveBlocker(blocker.id, 'Dispatch campaign resumed without failing tasks');
    }
    return;
  }

  if (dispatchOpen.length > 0) return;

  const failedTasks = dispatchCampaign.tasks
    .filter((task) => task.status === DispatchTaskStatus.FAILED)
    .slice(0, 3);
  const summaryLine = failedTasks.map((task) => task.title).join(', ');

  await createBlocker({
    campaignId: opsCampaignId,
    summary: `Dispatch paused after ${summary.failed} failed task(s)`,
    details: failedTasks
      .map((task) =>
        [
          `Task: ${task.title}`,
          task.errorMessage ? `Error: ${task.errorMessage}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      )
      .join('\n\n'),
    severity: 'high',
    attemptedMethod: 'dispatch_execution',
    failureEvidence: summaryLine || `Dispatch campaign ${dispatchCampaignId} entered PAUSED`,
    requiredResolution: 'Retry or replan the failed dispatch task(s)',
    canContinueElsewhere: false,
    status: 'open',
    metadata: {
      source: 'dispatch',
      dispatchCampaignId,
      failedTaskIds: failedTasks.map((task) => task.id),
    },
  });
}

export async function ensureDispatchBinding(
  opsCampaignId: string,
): Promise<{ opsCampaign: McCampaign; dispatchCampaignId: string }> {
  const campaign = await getCampaign(opsCampaignId);
  if (!campaign) {
    throw new Error('Ops campaign not found');
  }

  const existingBinding = getDispatchBinding(campaign);
  if (existingBinding?.dispatchCampaignId) {
    return { opsCampaign: campaign, dispatchCampaignId: existingBinding.dispatchCampaignId };
  }

  const dispatchCampaign = await createDispatchCampaign({
    title: campaign.name,
    description: campaign.description ?? campaign.objective ?? undefined,
    linkedTaskRef: `ops:${campaign.id}`,
  });

  const binding: DispatchBinding = {
    backend: 'dispatch',
    lifecycleContractVersion: CONTRACT_VERSION,
    dispatchCampaignId: dispatchCampaign.id,
    dispatchStatus: dispatchCampaign.status,
    durableStatus: campaign.status,
    lastSyncedAt: new Date().toISOString(),
  };

  const updated = await mergeMetadata(opsCampaignId, {
    executionBackend: 'dispatch',
    dispatchBinding: binding,
  });

  await record(
    opsCampaignId,
    'campaign_updated',
    `Bound ops campaign to dispatch campaign ${dispatchCampaign.id}`,
    {
      binding,
    } satisfies JsonValue,
  );

  return {
    opsCampaign: updated ?? campaign,
    dispatchCampaignId: dispatchCampaign.id,
  };
}

async function prepareDispatchCampaign(opsCampaignId: string): Promise<{
  opsCampaign: McCampaign;
  dispatchCampaign: BoundDispatchCampaign;
}> {
  const { opsCampaign, dispatchCampaignId } = await ensureDispatchBinding(opsCampaignId);
  let dispatchCampaign = await getDispatchCampaign(dispatchCampaignId);
  if (!dispatchCampaign) {
    throw new Error('Dispatch campaign binding is missing its target campaign');
  }

  if (!dispatchCampaign.latestPlan) {
    await generateDispatchPlans(dispatchCampaign.id);
    dispatchCampaign = await getDispatchCampaign(dispatchCampaign.id);
    if (!dispatchCampaign) throw new Error('Dispatch plan generation lost campaign state');
  }

  if (dispatchCampaign.tasks.length === 0) {
    await approveDispatchPlan(dispatchCampaign.id);
    dispatchCampaign = await getDispatchCampaign(dispatchCampaign.id);
    if (!dispatchCampaign) throw new Error('Dispatch plan approval lost campaign state');
  }

  if (
    dispatchCampaign.status !== DispatchCampaignStatus.QUEUED &&
    dispatchCampaign.status !== DispatchCampaignStatus.SCHEDULED &&
    dispatchCampaign.status !== DispatchCampaignStatus.COMPLETED
  ) {
    await enqueueDispatchCampaign(dispatchCampaign.id);
    dispatchCampaign = await getDispatchCampaign(dispatchCampaign.id);
    if (!dispatchCampaign) throw new Error('Dispatch enqueue lost campaign state');
  }

  return { opsCampaign, dispatchCampaign };
}

export async function mirrorDispatchCampaignStateToOps(input: {
  opsCampaignId: string;
  dispatchCampaignId: string;
  taskId?: string;
  reason: DispatchSyncReason;
}): Promise<{
  durableStatus: 'queued' | 'running' | 'blocked' | 'completed';
  dispatchCampaignId: string;
  summary: DispatchTaskSummary;
}> {
  const opsCampaign = await getCampaign(input.opsCampaignId);
  if (!opsCampaign) {
    throw new Error('Ops campaign not found');
  }

  const binding = getDispatchBinding(opsCampaign);
  if (!binding?.dispatchCampaignId || binding.dispatchCampaignId !== input.dispatchCampaignId) {
    throw new Error('Ops campaign is not bound to the requested dispatch campaign');
  }

  const dispatchCampaign = await getDispatchCampaign(input.dispatchCampaignId);
  if (!dispatchCampaign) {
    throw new Error(`Bound dispatch campaign ${input.dispatchCampaignId} not found`);
  }

  const summary = summarizeDispatchTasks(dispatchCampaign);
  const durableStatus = mapDispatchCampaignToDurableStatus(dispatchCampaign, summary);

  await ensureDispatchTaskArtifacts(
    input.opsCampaignId,
    dispatchCampaign.id,
    dispatchCampaign,
  );
  await syncDispatchBlockers(
    input.opsCampaignId,
    dispatchCampaign.id,
    dispatchCampaign,
    summary,
  );

  await setProgressSummary(input.opsCampaignId, {
    progress: progressFromSummary(summary),
    filesUpdated: summary.done,
    rowsProcessed: 0,
    batchCount: summary.total,
  });

  if (opsCampaign.status !== durableStatus) {
    await setStatus(
      input.opsCampaignId,
      durableStatus,
      `Dispatch campaign ${dispatchCampaign.id} is ${dispatchCampaign.status}`,
    );
  }

  const nextBinding: DispatchBinding = {
    backend: 'dispatch',
    lifecycleContractVersion: CONTRACT_VERSION,
    dispatchCampaignId: dispatchCampaign.id,
    dispatchStatus: dispatchCampaign.status,
    durableStatus,
    taskSummary: summary,
    lastSyncedAt: new Date().toISOString(),
  };

  await mergeMetadata(input.opsCampaignId, {
    executionBackend: 'dispatch',
    dispatchBinding: nextBinding,
  });

  const durableEvent =
    input.reason === 'completed' ? 'campaign_completed'
    : input.reason === 'failed' ? 'campaign_failed'
    : 'execution_progress';

  const reasonMessage =
    input.reason === 'claimed' ? `Dispatch campaign ${dispatchCampaign.id} claimed for execution`
    : input.reason === 'heartbeat' ? `Dispatch campaign ${dispatchCampaign.id} heartbeat received`
    : input.reason === 'task_started' ? `Dispatch task started${input.taskId ? `: ${input.taskId}` : ''}`
    : input.reason === 'task_completed' ? `Dispatch task completed${input.taskId ? `: ${input.taskId}` : ''}`
    : input.reason === 'task_failed' ? `Dispatch task failed${input.taskId ? `: ${input.taskId}` : ''}`
    : input.reason === 'completed' ? `Dispatch campaign ${dispatchCampaign.id} completed`
    : input.reason === 'failed' ? `Dispatch campaign ${dispatchCampaign.id} blocked`
    : `Dispatch sync: ${dispatchCampaign.status}`;

  await record(
    input.opsCampaignId,
    durableEvent,
    `${reasonMessage} (${summary.done}/${summary.total} complete, ${summary.failed} failed)`,
    {
      dispatchCampaignId: dispatchCampaign.id,
      dispatchStatus: String(dispatchCampaign.status),
      durableStatus,
      taskId: input.taskId ?? null,
      reason: input.reason,
      taskSummary: summary,
      lifecycleContractVersion: CONTRACT_VERSION,
    } as JsonValue,
  );

  return {
    durableStatus,
    dispatchCampaignId: dispatchCampaign.id,
    summary,
  };
}

export async function syncDispatchBackedCampaign(
  opsCampaignId: string,
): Promise<{
  durableStatus: 'queued' | 'running' | 'blocked' | 'completed';
  dispatchCampaignId: string;
  summary: DispatchTaskSummary;
}> {
  const opsCampaign = await getCampaign(opsCampaignId);
  if (!opsCampaign) {
    throw new Error('Ops campaign not found');
  }

  const binding = getDispatchBinding(opsCampaign);
  if (!binding?.dispatchCampaignId) {
    throw new Error('Ops campaign is not bound to dispatch');
  }

  return mirrorDispatchCampaignStateToOps({
    opsCampaignId,
    dispatchCampaignId: binding.dispatchCampaignId,
    reason: 'queued',
  });
}

export async function startDispatchBackedCampaign(opsCampaignId: string): Promise<void> {
  const { dispatchCampaign } = await prepareDispatchCampaign(opsCampaignId);
  await mirrorDispatchCampaignStateToOps({
    opsCampaignId,
    dispatchCampaignId: dispatchCampaign.id,
    reason: 'queued',
  });

  try {
    await runDispatchCampaign(dispatchCampaign.id, async ({ campaignId, taskId, reason }) => {
      await mirrorDispatchCampaignStateToOps({
        opsCampaignId,
        dispatchCampaignId: campaignId,
        taskId,
        reason,
      });
    });
  } finally {
    await mirrorDispatchCampaignStateToOps({
      opsCampaignId,
      dispatchCampaignId: dispatchCampaign.id,
      reason: 'queued',
    });
  }
}
