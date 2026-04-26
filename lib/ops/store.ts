// In-memory mission registry for the Ops control plane.
//
// This is the *only* component that should ever hold campaign state outside
// of the WDK runtime + your durable storage. There is no fake/seed campaign
// data — the registry starts empty and grows as the operator dispatches
// missions through `dispatchMission()` (see `lib/ops/runtime.ts`).
//
// The agent roster below is treated as static template metadata, not
// runtime state — it tells the dispatch modal which lead agents are
// available. Once a real `agents` table exists in Postgres, replace
// `listAgents()` with a Drizzle query and delete the constant.
//
// Module-scoped variables persist across requests within a single server
// instance. They are NOT a substitute for durable storage — they are the
// thinnest possible mirror of workflow state so the UI has something to
// read between events. The workflow itself is the source of truth.

import type {
  Agent,
  Campaign,
  CampaignArtifact,
  CampaignBlocker,
  CampaignControlAction,
  CampaignStatus,
  CreateCampaignInput,
  FeedEvent,
  OpsTickerSummary,
  SystemRules,
  WatchdogState,
} from './types';

const STALE_MINUTES = 12;

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Agent roster (template metadata) ────────────────────────────────────────
// Real agents live in Postgres; this is just enough for the dispatch UI to
// populate its lead-agent dropdown until the schema is wired up.
const agents: Agent[] = [
  {
    id: 'agent_adrian',
    name: 'Adrian',
    domain: 'Web extraction',
    capabilities: ['catalog audit', 'product extraction', 'browser fallback'],
    status: 'IDLE',
    activeCampaignIds: [],
  },
  {
    id: 'agent_ruby',
    name: 'Ruby',
    domain: 'Outreach',
    capabilities: ['campaign drafting', 'creator outreach', 'content QA'],
    status: 'IDLE',
    activeCampaignIds: [],
  },
  {
    id: 'agent_iceman',
    name: 'Iceman',
    domain: 'Build & deploy',
    capabilities: ['build orchestration', 'deploy gating', 'release notes'],
    status: 'IDLE',
    activeCampaignIds: [],
  },
  {
    id: 'agent_marvin',
    name: 'Marvin',
    domain: 'Finance',
    capabilities: ['ledger reconciliation', 'payable scan', 'cash projection'],
    status: 'IDLE',
    activeCampaignIds: [],
  },
];

// ── Mission registry ────────────────────────────────────────────────────────
// Starts empty. Populated only by `createCampaign()` (called from the
// dispatch route via the runtime adapter).
const campaigns: Campaign[] = [];

// Maps campaignId → workflow runId so control actions can find the run.
const runIdByCampaignId = new Map<string, string>();

// ── System rules ────────────────────────────────────────────────────────────
let systemRules: SystemRules = {
  executionMode: true,
  fallbackEnforcement: true,
  batchMinimum: 5,
  watchdogIntervalMinutes: 10,
  blockerThreshold: 3,
};

// ── Public API: reads ───────────────────────────────────────────────────────
export function listAgents(): Agent[] {
  // Recompute live status from active campaigns so agents reflect what their
  // missions are doing without any background simulation.
  return agents.map((a) => {
    const activeCampaignIds = campaigns
      .filter((c) => c.leadAgentId === a.id && c.status === 'RUNNING')
      .map((c) => c.id);
    const blocked = campaigns.some(
      (c) => c.leadAgentId === a.id && c.status === 'BLOCKED'
    );
    return {
      ...a,
      activeCampaignIds,
      status: blocked ? 'BLOCKED' : activeCampaignIds.length > 0 ? 'RUNNING' : 'IDLE',
    };
  });
}

export function getAgent(id: string): Agent | undefined {
  return listAgents().find((a) => a.id === id);
}

export function listCampaigns(): Campaign[] {
  return campaigns.map((c) => ({ ...c }));
}

export function getCampaign(id: string): Campaign | undefined {
  const c = campaigns.find((x) => x.id === id);
  return c ? { ...c } : undefined;
}

export function getCampaignFeed(id: string): FeedEvent[] {
  const c = campaigns.find((x) => x.id === id);
  return c ? [...c.feed] : [];
}

export function getCampaignArtifact(
  id: string,
  artifactName: string
): CampaignArtifact | undefined {
  const c = campaigns.find((x) => x.id === id);
  return c?.artifacts.find((a) => a.name === artifactName);
}

export function getRunIdForCampaign(id: string): string | undefined {
  return runIdByCampaignId.get(id);
}

// ── Public API: writes ──────────────────────────────────────────────────────
// All write paths are designed so they can be called from `'use step'`
// functions in the workflow runtime. They are pure data updates with no I/O.

export function createCampaign(input: CreateCampaignInput): Campaign {
  const id = uid('camp');
  const now = new Date().toISOString();
  const next: Campaign = {
    id,
    name: input.name,
    objective: input.objective,
    leadAgentId: input.leadAgentId,
    status: 'IDLE', // promoted to RUNNING by the workflow itself
    lastActivityAt: now,
    startedAt: now,
    progress: 0,
    quickStats: { filesUpdated: 0, rowsProcessed: 0, batchCount: 0 },
    artifacts: [],
    blocker: null,
    feed: [
      {
        id: uid('fe'),
        timestamp: now,
        level: 'info',
        message: `Mission queued · mode=${input.executionMode.toLowerCase()} · agent=${input.leadAgentId.replace('agent_', '')}`,
      },
    ],
    executionMode: input.executionMode,
    minimumBatchSize: input.minimumBatchSize,
    requiredArtifacts: input.requiredArtifacts,
  };
  campaigns.unshift(next);
  return { ...next };
}

export function setCampaignRunId(campaignId: string, runId: string): void {
  runIdByCampaignId.set(campaignId, runId);
}

export function setCampaignStatus(id: string, status: CampaignStatus): void {
  const c = campaigns.find((x) => x.id === id);
  if (!c) return;
  c.status = status;
  c.lastActivityAt = new Date().toISOString();
  if (status === 'COMPLETED') c.progress = 1;
}

export function setCampaignProgress(id: string, progress: number): void {
  const c = campaigns.find((x) => x.id === id);
  if (!c) return;
  c.progress = Math.max(0, Math.min(1, progress));
  c.lastActivityAt = new Date().toISOString();
}

export function setCampaignBlocker(
  id: string,
  blocker: CampaignBlocker | null
): void {
  const c = campaigns.find((x) => x.id === id);
  if (!c) return;
  c.blocker = blocker;
  c.lastActivityAt = new Date().toISOString();
}

export function recordEvent(
  id: string,
  event: { level: FeedEvent['level']; message: string }
): FeedEvent | undefined {
  const c = campaigns.find((x) => x.id === id);
  if (!c) return undefined;
  const fe: FeedEvent = {
    id: uid('fe'),
    timestamp: new Date().toISOString(),
    level: event.level,
    message: event.message,
  };
  c.feed.unshift(fe);
  // Cap feed length to avoid unbounded growth on long-running missions.
  if (c.feed.length > 200) c.feed.length = 200;
  c.lastActivityAt = fe.timestamp;
  return fe;
}

export function upsertArtifact(
  id: string,
  artifact: { name: string; content: string; rows?: number }
): CampaignArtifact | undefined {
  const c = campaigns.find((x) => x.id === id);
  if (!c) return undefined;
  const now = new Date().toISOString();
  const size = Buffer.byteLength(artifact.content, 'utf8');
  // Truncate preview to 4 KB so we don't ship huge payloads to the client.
  const preview =
    artifact.content.length > 4096
      ? `${artifact.content.slice(0, 4096)}\n\n_…truncated_`
      : artifact.content;

  const existingIndex = c.artifacts.findIndex((a) => a.name === artifact.name);
  const next: CampaignArtifact = {
    name: artifact.name,
    size,
    rows: artifact.rows,
    updatedAt: now,
    preview,
  };
  if (existingIndex >= 0) {
    c.artifacts[existingIndex] = next;
  } else {
    c.artifacts.push(next);
    c.quickStats.filesUpdated = c.artifacts.length;
  }
  if (typeof artifact.rows === 'number') {
    c.quickStats.rowsProcessed = artifact.rows;
  }
  c.lastActivityAt = now;
  return next;
}

export function incrementBatchCount(id: string): void {
  const c = campaigns.find((x) => x.id === id);
  if (!c) return;
  c.quickStats.batchCount += 1;
  c.lastActivityAt = new Date().toISOString();
}

// ── Operator control actions ────────────────────────────────────────────────
// These are the synchronous local-state effects. The runtime adapter layers
// the actual workflow control on top (`world.events.create()` for cancel,
// `resumeHook()` for approval, etc.).
export function applyControl(
  id: string,
  action: CampaignControlAction
): Campaign | undefined {
  const c = campaigns.find((x) => x.id === id);
  if (!c) return undefined;

  switch (action) {
    case 'resume':
      c.status = 'RUNNING';
      c.blocker = null;
      recordEvent(id, { level: 'success', message: 'Execution resumed by operator' });
      break;
    case 'force_retry':
      c.status = 'RUNNING';
      recordEvent(id, { level: 'info', message: 'Force retry issued' });
      break;
    case 'approve_action':
      c.status = 'RUNNING';
      recordEvent(id, { level: 'success', message: 'Operator approved pending action' });
      break;
    case 'escalate':
      recordEvent(id, { level: 'warn', message: 'Escalated to human review' });
      break;
    case 'kill':
      c.status = 'COMPLETED';
      c.progress = 1;
      recordEvent(id, { level: 'error', message: 'Mission killed by operator' });
      break;
  }
  return { ...c };
}

// ── System rules ────────────────────────────────────────────────────────────
export function getSystemRules(): SystemRules {
  return { ...systemRules };
}

export function updateSystemRules(patch: Partial<SystemRules>): SystemRules {
  systemRules = { ...systemRules, ...patch };
  return { ...systemRules };
}

// ── Watchdog ────────────────────────────────────────────────────────────────
export function getWatchdogState(): WatchdogState {
  const inProgress = campaigns
    .filter((c) => c.status === 'RUNNING' || c.status === 'DEPLOYING' || c.status === 'BLOCKED')
    .map((c) => {
      const ageMin = (Date.now() - new Date(c.lastActivityAt).getTime()) / 60_000;
      const lead = agents.find((a) => a.id === c.leadAgentId);
      return {
        campaignId: c.id,
        name: c.name,
        leadAgentName: lead?.name ?? 'Unassigned',
        lastActivityAt: c.lastActivityAt,
        isStale: ageMin > STALE_MINUTES,
        isMissingArtifacts: c.requiredArtifacts.some(
          (req) => !c.artifacts.find((a) => a.name === req)
        ),
        hasInvalidBlocker:
          !!c.blocker && c.blocker.attempts >= systemRules.blockerThreshold && !c.blocker.requiredInput,
      };
    });

  return { inProgress, staleThresholdMinutes: STALE_MINUTES };
}

export function forceResumeAll(): number {
  let count = 0;
  for (const c of campaigns) {
    if (c.status === 'BLOCKED') {
      c.status = 'RUNNING';
      c.blocker = null;
      recordEvent(c.id, { level: 'success', message: 'Watchdog: force-resume' });
      count += 1;
    }
  }
  return count;
}

export function escalateAllBlockers(): number {
  let count = 0;
  for (const c of campaigns) {
    if (c.blocker) {
      recordEvent(c.id, {
        level: 'warn',
        message: `Watchdog: escalated blocker (${c.blocker.type})`,
      });
      count += 1;
    }
  }
  return count;
}

// ── Ticker ──────────────────────────────────────────────────────────────────
export function getTickerSummary(): OpsTickerSummary {
  const active = campaigns.filter(
    (c) => c.status === 'RUNNING' || c.status === 'DEPLOYING'
  ).length;
  const blocked = campaigns.filter((c) => c.status === 'BLOCKED').length;
  const entries = campaigns.map((c) => {
    const label =
      c.status === 'RUNNING'
        ? `${c.name}: Running`
        : c.status === 'BLOCKED'
        ? `${c.name}: Blocked`
        : c.status === 'IDLE'
        ? `${c.name}: Queued`
        : c.status === 'DEPLOYING'
        ? `${c.name}: Deploying`
        : `${c.name}: Completed`;
    const status: 'OK' | 'WARN' | 'CRIT' =
      c.status === 'BLOCKED' ? 'CRIT' : c.status === 'IDLE' ? 'WARN' : 'OK';
    return { label, status };
  });
  // Always show the watchdog heartbeat so the ticker isn't empty pre-dispatch.
  entries.push({
    label: campaigns.length === 0 ? 'No active missions' : 'Watchdog: Active',
    status: 'OK',
  });
  return { activeCampaigns: active, blockedCampaigns: blocked, entries };
}
