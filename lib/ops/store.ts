// In-memory mock store for the Ops control plane.
// Module-scoped so values persist across requests within a single
// server instance. Replace with a real backend (Supabase, Postgres,
// or an event store) without changing the API route shapes.

import type {
  Agent,
  Campaign,
  CampaignControlAction,
  CreateCampaignInput,
  FeedEvent,
  OpsTickerSummary,
  SystemRules,
  WatchdogState,
} from './types';

const STALE_MINUTES = 12;

function isoMinutesAgo(min: number): string {
  return new Date(Date.now() - min * 60_000).toISOString();
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// ── Agents ──────────────────────────────────────────────────────────────────
const agents: Agent[] = [
  {
    id: 'agent_adrian',
    name: 'Adrian',
    domain: 'Shopify',
    capabilities: ['catalog audit', 'product extraction', 'browser fallback'],
    status: 'RUNNING',
    activeCampaignIds: ['camp_shopify_audit'],
  },
  {
    id: 'agent_ruby',
    name: 'Ruby',
    domain: 'TikTok',
    capabilities: ['campaign drafting', 'creator outreach', 'content QA'],
    status: 'IDLE',
    activeCampaignIds: ['camp_tiktok_q1'],
  },
  {
    id: 'agent_iceman',
    name: 'Iceman',
    domain: 'Product',
    capabilities: ['build orchestration', 'deploy gating', 'release notes'],
    status: 'RUNNING',
    activeCampaignIds: ['camp_nuriy_deploy'],
  },
  {
    id: 'agent_marvin',
    name: 'Marvin',
    domain: 'Finance',
    capabilities: ['ledger reconciliation', 'payable scan', 'cash projection'],
    status: 'BLOCKED',
    activeCampaignIds: ['camp_finance_recon'],
  },
];

// ── Campaigns ───────────────────────────────────────────────────────────────
const campaigns: Campaign[] = [
  {
    id: 'camp_shopify_audit',
    name: 'Shopify Audit',
    objective: 'Audit full product catalog and emit normalized products.md.',
    leadAgentId: 'agent_adrian',
    status: 'RUNNING',
    lastActivityAt: isoMinutesAgo(1),
    startedAt: isoMinutesAgo(38),
    progress: 0.62,
    quickStats: { filesUpdated: 7, rowsProcessed: 1284, batchCount: 5 },
    artifacts: [
      {
        name: 'products.md',
        size: 48_210,
        rows: 1284,
        updatedAt: isoMinutesAgo(1),
        preview:
          '# Shopify Catalog\n\n| SKU | Title | Price | Inventory |\n| --- | --- | --- | --- |\n| SH-001 | Atlas Tee | $34.00 | 142 |\n| SH-002 | Nimbus Hoodie | $78.00 | 67 |\n| SH-003 | Halcyon Cap | $24.00 | 0 |\n| SH-004 | Vector Tote | $42.00 | 88 |\n\n_…1,280 more rows_',
      },
      {
        name: 'action-log.md',
        size: 9_842,
        updatedAt: isoMinutesAgo(2),
        preview:
          '## Action Log\n- [00:38:14] Catalog snapshot taken (1,284 rows)\n- [00:38:42] Batch 1/5 normalized\n- [00:39:11] Batch 2/5 normalized\n- [00:39:45] Browser fallback engaged (rate limit)\n- [00:40:19] Batch 3/5 normalized',
      },
      {
        name: 'blockers.md',
        size: 412,
        updatedAt: isoMinutesAgo(7),
        preview: '## Blockers\n_(none)_',
      },
    ],
    blocker: null,
    feed: [
      { id: uid('fe'), timestamp: isoMinutesAgo(0.05), level: 'info', message: 'Extracting product batch (5/5)' },
      { id: uid('fe'), timestamp: isoMinutesAgo(0.4), level: 'warn', message: 'Fallback: Browser extraction' },
      { id: uid('fe'), timestamp: isoMinutesAgo(0.9), level: 'info', message: 'Writing to products.md' },
      { id: uid('fe'), timestamp: isoMinutesAgo(1.6), level: 'success', message: 'Batch 4/5 committed (312 rows)' },
      { id: uid('fe'), timestamp: isoMinutesAgo(2.4), level: 'info', message: 'Batch 4/5 normalize started' },
      { id: uid('fe'), timestamp: isoMinutesAgo(3.1), level: 'success', message: 'Batch 3/5 committed (256 rows)' },
    ],
    executionMode: 'STANDARD',
    minimumBatchSize: 5,
    requiredArtifacts: ['products.md', 'action-log.md', 'blockers.md'],
  },
  {
    id: 'camp_tiktok_q1',
    name: 'TikTok Campaign Q1',
    objective: 'Draft, validate, and stage Q1 creator outreach.',
    leadAgentId: 'agent_ruby',
    status: 'IDLE',
    lastActivityAt: isoMinutesAgo(22),
    startedAt: isoMinutesAgo(140),
    progress: 0.34,
    quickStats: { filesUpdated: 3, rowsProcessed: 84, batchCount: 2 },
    artifacts: [
      {
        name: 'creators.md',
        size: 12_004,
        rows: 84,
        updatedAt: isoMinutesAgo(22),
        preview:
          '# Creator Targets\n\n- @northbound — 412k followers — fashion\n- @halcyonhouse — 220k followers — design\n- @vectorline — 188k followers — tech\n- _…81 more_',
      },
      {
        name: 'action-log.md',
        size: 4_312,
        updatedAt: isoMinutesAgo(22),
        preview:
          '## Action Log\n- [00:00:12] Audience filter applied\n- [00:01:48] 84 candidates scored\n- [00:02:22] Awaiting approval to draft outreach',
      },
    ],
    blocker: null,
    feed: [
      { id: uid('fe'), timestamp: isoMinutesAgo(22), level: 'info', message: 'Awaiting approval to draft outreach' },
      { id: uid('fe'), timestamp: isoMinutesAgo(24), level: 'success', message: '84 creators scored' },
      { id: uid('fe'), timestamp: isoMinutesAgo(26), level: 'info', message: 'Audience filter applied' },
    ],
    executionMode: 'STANDARD',
    minimumBatchSize: 5,
    requiredArtifacts: ['creators.md', 'action-log.md'],
  },
  {
    id: 'camp_nuriy_deploy',
    name: 'Nuriy Product Deploy',
    objective: 'Stage and deploy release v3.4 to production.',
    leadAgentId: 'agent_iceman',
    status: 'DEPLOYING',
    lastActivityAt: isoMinutesAgo(0.5),
    startedAt: isoMinutesAgo(11),
    progress: 0.81,
    quickStats: { filesUpdated: 22, rowsProcessed: 0, batchCount: 1 },
    artifacts: [
      {
        name: 'release-notes.md',
        size: 6_201,
        updatedAt: isoMinutesAgo(0.5),
        preview:
          '# Release v3.4\n\n## Highlights\n- Ops control plane (beta)\n- Watchdog interval reduced to 10m\n- Aggressive execution mode\n\n## Fixes\n- Stale campaign detection\n- Artifact diff rendering',
      },
      {
        name: 'action-log.md',
        size: 2_080,
        updatedAt: isoMinutesAgo(0.5),
        preview: '## Action Log\n- [00:11:02] Build green\n- [00:11:14] Deploying to production',
      },
    ],
    blocker: null,
    feed: [
      { id: uid('fe'), timestamp: isoMinutesAgo(0.3), level: 'info', message: 'Deploying to production' },
      { id: uid('fe'), timestamp: isoMinutesAgo(0.8), level: 'success', message: 'Build green' },
      { id: uid('fe'), timestamp: isoMinutesAgo(1.4), level: 'info', message: 'Compiling 142 modules' },
    ],
    executionMode: 'AGGRESSIVE',
    minimumBatchSize: 5,
    requiredArtifacts: ['release-notes.md', 'action-log.md'],
  },
  {
    id: 'camp_finance_recon',
    name: 'Finance Reconciliation',
    objective: 'Reconcile November ledger against bank feed.',
    leadAgentId: 'agent_marvin',
    status: 'BLOCKED',
    lastActivityAt: isoMinutesAgo(18),
    startedAt: isoMinutesAgo(64),
    progress: 0.45,
    quickStats: { filesUpdated: 4, rowsProcessed: 612, batchCount: 3 },
    artifacts: [
      {
        name: 'ledger-diff.md',
        size: 18_402,
        rows: 612,
        updatedAt: isoMinutesAgo(18),
        preview:
          '# Ledger Diff\n\n| Date | Memo | Ledger | Bank | Δ |\n| --- | --- | --- | --- | --- |\n| 11-04 | Stripe payout | $4,210 | $4,210 | 0 |\n| 11-07 | Plaid sync | — | $812 | +812 |',
      },
      {
        name: 'blockers.md',
        size: 612,
        updatedAt: isoMinutesAgo(18),
        preview: '## Blockers\n- MISSING_API_KEY: PLAID_CLIENT_ID required for sandbox refresh',
      },
    ],
    blocker: {
      type: 'MISSING_API_KEY',
      attempts: 3,
      requiredInput: 'PLAID_CLIENT_ID',
      detectedAt: isoMinutesAgo(18),
    },
    feed: [
      { id: uid('fe'), timestamp: isoMinutesAgo(18), level: 'error', message: 'Blocker detected: Missing API key' },
      { id: uid('fe'), timestamp: isoMinutesAgo(19), level: 'warn', message: 'Retry 3/3 failed for Plaid sandbox' },
      { id: uid('fe'), timestamp: isoMinutesAgo(20), level: 'warn', message: 'Retry 2/3 failed for Plaid sandbox' },
      { id: uid('fe'), timestamp: isoMinutesAgo(22), level: 'info', message: 'Refreshing Plaid sandbox cursor' },
    ],
    executionMode: 'STANDARD',
    minimumBatchSize: 5,
    requiredArtifacts: ['ledger-diff.md', 'blockers.md'],
  },
];

// ── System rules ────────────────────────────────────────────────────────────
let systemRules: SystemRules = {
  executionMode: true,
  fallbackEnforcement: true,
  batchMinimum: 5,
  watchdogIntervalMinutes: 10,
  blockerThreshold: 3,
};

// ── Live feed simulation ────────────────────────────────────────────────────
// On every read, we synthesize a few fresh events for RUNNING/DEPLOYING
// campaigns so the UI feels live without a real backend.
const LIVE_TEMPLATES: Record<string, string[]> = {
  camp_shopify_audit: [
    'Streaming product diff to artifact',
    'Browser fallback engaged (rate limit)',
    'Normalizing batch slice',
    'Writing to products.md',
    'Validated 64 SKUs in slice',
  ],
  camp_nuriy_deploy: [
    'Edge function deployed',
    'Cache warmed for /ops',
    'Health check OK',
    'Promoting build to production',
  ],
};

function tickLiveFeed(c: Campaign) {
  if (c.status !== 'RUNNING' && c.status !== 'DEPLOYING') return;
  const templates = LIVE_TEMPLATES[c.id];
  if (!templates) return;
  // 35% chance per read to add a new event, capped at 40 total.
  if (Math.random() < 0.35 && c.feed.length < 40) {
    const message = templates[Math.floor(Math.random() * templates.length)];
    c.feed.unshift({
      id: uid('fe'),
      timestamp: new Date().toISOString(),
      level: Math.random() < 0.15 ? 'warn' : 'info',
      message,
    });
    c.lastActivityAt = new Date().toISOString();
    if (c.progress < 0.95) c.progress = Math.min(0.95, c.progress + 0.005);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────
export function listAgents(): Agent[] {
  return agents.map((a) => ({ ...a }));
}

export function getAgent(id: string): Agent | undefined {
  return agents.find((a) => a.id === id);
}

export function listCampaigns(): Campaign[] {
  campaigns.forEach(tickLiveFeed);
  return campaigns.map((c) => ({ ...c }));
}

export function getCampaign(id: string): Campaign | undefined {
  const c = campaigns.find((x) => x.id === id);
  if (c) tickLiveFeed(c);
  return c ? { ...c } : undefined;
}

export function getCampaignFeed(id: string): FeedEvent[] {
  const c = campaigns.find((x) => x.id === id);
  if (!c) return [];
  tickLiveFeed(c);
  return [...c.feed];
}

export function createCampaign(input: CreateCampaignInput): Campaign {
  const id = uid('camp');
  const now = new Date().toISOString();
  const next: Campaign = {
    id,
    name: input.name,
    objective: input.objective,
    leadAgentId: input.leadAgentId,
    status: 'RUNNING',
    lastActivityAt: now,
    startedAt: now,
    progress: 0.05,
    quickStats: { filesUpdated: 0, rowsProcessed: 0, batchCount: 0 },
    artifacts: [],
    blocker: null,
    feed: [
      {
        id: uid('fe'),
        timestamp: now,
        level: 'success',
        message: `Campaign dispatched · mode=${input.executionMode.toLowerCase()}`,
      },
    ],
    executionMode: input.executionMode,
    minimumBatchSize: input.minimumBatchSize,
    requiredArtifacts: input.requiredArtifacts,
  };
  campaigns.unshift(next);
  return { ...next };
}

export function applyControl(id: string, action: CampaignControlAction): Campaign | undefined {
  const c = campaigns.find((x) => x.id === id);
  if (!c) return undefined;
  const now = new Date().toISOString();
  const event = (level: FeedEvent['level'], message: string): FeedEvent => ({
    id: uid('fe'),
    timestamp: now,
    level,
    message,
  });

  switch (action) {
    case 'resume':
      c.status = 'RUNNING';
      c.blocker = null;
      c.feed.unshift(event('success', 'Execution resumed by operator'));
      break;
    case 'force_retry':
      c.feed.unshift(event('info', 'Force retry issued'));
      c.status = 'RUNNING';
      break;
    case 'approve_action':
      c.feed.unshift(event('success', 'Operator approved pending action'));
      c.status = 'RUNNING';
      break;
    case 'escalate':
      c.feed.unshift(event('warn', 'Escalated to human review'));
      break;
    case 'kill':
      c.status = 'COMPLETED';
      c.feed.unshift(event('error', 'Task killed by operator'));
      c.progress = 1;
      break;
  }
  c.lastActivityAt = now;
  return { ...c };
}

export function getSystemRules(): SystemRules {
  return { ...systemRules };
}

export function updateSystemRules(patch: Partial<SystemRules>): SystemRules {
  systemRules = { ...systemRules, ...patch };
  return { ...systemRules };
}

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
      c.lastActivityAt = new Date().toISOString();
      c.feed.unshift({
        id: uid('fe'),
        timestamp: new Date().toISOString(),
        level: 'success',
        message: 'Watchdog: force-resume',
      });
      count += 1;
    }
  }
  return count;
}

export function escalateAllBlockers(): number {
  let count = 0;
  for (const c of campaigns) {
    if (c.blocker) {
      c.feed.unshift({
        id: uid('fe'),
        timestamp: new Date().toISOString(),
        level: 'warn',
        message: `Watchdog: escalated blocker (${c.blocker.type})`,
      });
      count += 1;
    }
  }
  return count;
}

export function getTickerSummary(): OpsTickerSummary {
  const active = campaigns.filter((c) => c.status === 'RUNNING' || c.status === 'DEPLOYING').length;
  const blocked = campaigns.filter((c) => c.status === 'BLOCKED').length;
  const entries = campaigns.map((c) => {
    let label: string;
    if (c.status === 'RUNNING') label = `${c.name}: Running`;
    else if (c.status === 'BLOCKED') label = `${c.name}: Blocked`;
    else if (c.status === 'IDLE') label = `${c.name}: Idle`;
    else if (c.status === 'DEPLOYING') label = `${c.name}: Deploying`;
    else label = `${c.name}: Completed`;
    const status: 'OK' | 'WARN' | 'CRIT' =
      c.status === 'BLOCKED' ? 'CRIT' : c.status === 'IDLE' ? 'WARN' : 'OK';
    return { label, status };
  });
  entries.push({ label: 'Watchdog: Active', status: 'OK' });
  return { activeCampaigns: active, blockedCampaigns: blocked, entries };
}
