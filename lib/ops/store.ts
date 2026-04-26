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
  if (status === 'CANCELLED' || status === 'FAILED') c.progress = Math.min(c.progress, 0.99);
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
      c.status = 'CANCELLED';
      recordEvent(id, { level: 'error', message: 'Mission cancelled by operator' });
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

// ── Demo seed (for hackathon recording / first-look demos) ──────────────────
// Creates three richly-populated missions in different states so the /ops
// surface has compelling visual content when there's no live workflow run.
// Bypasses the WDK runtime intentionally — these are local fixtures, not
// real workflow runs. Marked with `demo: true` would be cleaner, but the
// Campaign type doesn't carry that flag; the convention here is that demo
// missions all start with `Demo:` in their name.
export function seedDemoMissions(): { created: string[] } {
  resetDemoMissions(); // idempotent — clears any prior demo seed
  const created: string[] = [];
  const now = new Date();

  // ── Mission 1: RUNNING — Adrian Shopify audit ─────────────────────────────
  const m1 = createCampaign({
    name: 'Demo: Shopify Catalog Audit',
    objective:
      'Audit live Shopify catalog for missing alt text, broken variant links, and pricing drift. Produce per-product diff and a remediation queue.',
    leadAgentId: 'agent_adrian',
    requiredArtifacts: ['products.md', 'action-log.md'],
    minimumBatchSize: 5,
    executionMode: 'STANDARD',
  });
  setCampaignStatus(m1.id, 'RUNNING');
  setCampaignProgress(m1.id, 0.62);
  upsertArtifact(m1.id, {
    name: 'products.md',
    rows: 184,
    content: [
      '# Catalog Audit · Products',
      '',
      '_184 products scanned · 23 issues flagged_',
      '',
      '| SKU | Issue | Severity |',
      '| --- | ----- | -------- |',
      '| ATL-TEE-001 | Missing alt text on 3 variant images | low |',
      '| ATL-HOODIE-014 | Variant link 404 on `/black-xl` | high |',
      '| HCY-CAP-007 | Compare-at price below sale price | medium |',
      '| ATL-CREW-019 | SEO description exceeds 160 chars | low |',
      '| HCY-PAN-022 | Inventory quantity mismatch (Shopify ↔ ledger) | high |',
      '',
      '_Continued for 18 more rows…_',
    ].join('\n'),
  });
  upsertArtifact(m1.id, {
    name: 'action-log.md',
    rows: 4,
    content: [
      '# Action Log',
      '',
      '- `2026-04-25T14:02:11Z` — Pulled 184 products from Storefront API',
      '- `2026-04-25T14:02:48Z` — Ran alt-text checker (mcp.image-audit)',
      '- `2026-04-25T14:03:32Z` — Ran variant link probe on 47 products',
      '- `2026-04-25T14:04:15Z` — Detected 6 high-severity issues — drafting remediation plan',
    ].join('\n'),
  });
  for (const ev of [
    { level: 'info' as const, message: 'Started Adrian · target=storefront.api', minus: 240 },
    { level: 'info' as const, message: 'Fetched 184 products · 5 batches', minus: 200 },
    { level: 'info' as const, message: 'Batch 1/5 complete · 0 issues', minus: 175 },
    { level: 'info' as const, message: 'Batch 2/5 complete · 7 issues flagged', minus: 140 },
    { level: 'warn' as const, message: 'Variant link probe: 6 high-severity 404s on Halcyon SKUs', minus: 95 },
    { level: 'info' as const, message: 'Batch 3/5 complete · drafting remediation plan via AI Gateway', minus: 60 },
    { level: 'success' as const, message: 'Wrote products.md · 184 rows', minus: 30 },
  ]) {
    backdateEvent(m1.id, now, ev.minus, ev.level, ev.message);
  }
  created.push(m1.id);

  // ── Mission 2: BLOCKED — Marvin finance recon awaiting approval ───────────
  const m2 = createCampaign({
    name: 'Demo: Finance Recon (Apr 2026)',
    objective:
      'Reconcile April expense ledger against Plaid feed. Flag merchant overlaps and propose subscription cancellations needing operator approval.',
    leadAgentId: 'agent_marvin',
    requiredArtifacts: ['ledger-diff.md', 'blockers.md'],
    minimumBatchSize: 5,
    executionMode: 'STANDARD',
  });
  setCampaignStatus(m2.id, 'BLOCKED');
  setCampaignProgress(m2.id, 0.48);
  upsertArtifact(m2.id, {
    name: 'ledger-diff.md',
    rows: 89,
    content: [
      '# April Reconciliation Diff',
      '',
      '_89 transactions reconciled · 4 unresolved · 2 awaiting approval_',
      '',
      '## Unresolved',
      '',
      '- `$847.20` — Vercel · matches 2 candidate ledger entries',
      '- `$129.00` — Anthropic · no ledger match',
      '- `$58.00` — Notion · duplicate of `notion-team` charge from Mar 31',
      '- `$24.00` — GitHub · prorated, ledger expects $19',
      '',
      '## Awaiting Approval',
      '',
      '- Cancel duplicate Notion subscription? `$58/mo` overlap with team plan',
      '- Reclassify `$24 GitHub` from "tools" to "subscriptions"?',
    ].join('\n'),
  });
  setCampaignBlocker(m2.id, {
    type: 'pending_input',
    summary: 'Awaiting operator approval to cancel duplicate Notion subscription',
    requiredInput: 'approve | deny',
    attempts: 1,
    surfacedAt: new Date(now.getTime() - 90 * 1000).toISOString(),
  });
  for (const ev of [
    { level: 'info' as const, message: 'Started Marvin · target=plaid+ledger', minus: 720 },
    { level: 'info' as const, message: 'Fetched 142 Plaid transactions · April 1–30', minus: 680 },
    { level: 'info' as const, message: 'Loaded ledger snapshot · 138 entries', minus: 660 },
    { level: 'info' as const, message: 'Reconciled 89/142 · 4 unresolved', minus: 480 },
    { level: 'warn' as const, message: 'Detected duplicate Notion subscription · $58/mo overlap', minus: 180 },
    { level: 'warn' as const, message: 'Pausing for operator approval · cancel duplicate?', minus: 90 },
  ]) {
    backdateEvent(m2.id, now, ev.minus, ev.level, ev.message);
  }
  created.push(m2.id);

  // ── Mission 3: COMPLETED — Iceman deploy ──────────────────────────────────
  const m3 = createCampaign({
    name: 'Demo: Mothership Deploy v0.142.0',
    objective:
      'Build, gate, and deploy mothership v0.142.0. Generate release notes, run smoke tests, and post deploy receipt.',
    leadAgentId: 'agent_iceman',
    requiredArtifacts: ['release-notes.md', 'action-log.md'],
    minimumBatchSize: 1,
    executionMode: 'STANDARD',
  });
  setCampaignStatus(m3.id, 'COMPLETED');
  setCampaignProgress(m3.id, 1);
  upsertArtifact(m3.id, {
    name: 'release-notes.md',
    rows: 12,
    content: [
      '# v0.142.0',
      '',
      '## Highlights',
      '',
      '- Added `/ops` mission control surface',
      '- Wired Vercel Workflow / WDK for durable agent runs',
      '- Mission AI calls now route through Vercel AI Gateway',
      '',
      '## Internal',
      '',
      '- Replaced Prisma with Drizzle on the Plaid + finance surface',
      '- Stubbed 23 in-flight migration routes to 503',
      '- Added watchdog panel for stale-mission detection',
    ].join('\n'),
  });
  upsertArtifact(m3.id, {
    name: 'action-log.md',
    rows: 6,
    content: [
      '# Deploy Action Log',
      '',
      '- `pre-flight` · ✓ Type check passed (0 errors)',
      '- `pre-flight` · ✓ Smoke suite passed (28/28)',
      '- `build` · ✓ next build · 12.4s · 0 warnings',
      '- `deploy` · ✓ Promoted to production · `mothership-7286.vercel.app`',
      '- `verify` · ✓ Health check returned 200 in 142ms',
    ].join('\n'),
  });
  for (const ev of [
    { level: 'info' as const, message: 'Started Iceman · target=production', minus: 1860 },
    { level: 'info' as const, message: 'Type check passed', minus: 1820 },
    { level: 'info' as const, message: 'Smoke suite passed (28/28)', minus: 1780 },
    { level: 'info' as const, message: 'next build complete · 12.4s', minus: 1640 },
    { level: 'info' as const, message: 'Promoted to production', minus: 1600 },
    { level: 'success' as const, message: 'Deploy verified · health=200 · 142ms', minus: 1580 },
    { level: 'success' as const, message: 'Mission complete · all required artifacts produced', minus: 1575 },
  ]) {
    backdateEvent(m3.id, now, ev.minus, ev.level, ev.message);
  }
  created.push(m3.id);

  return { created };
}

export function resetDemoMissions(): { removed: number } {
  const before = campaigns.length;
  for (let i = campaigns.length - 1; i >= 0; i--) {
    if (campaigns[i].name.startsWith('Demo:')) {
      runIdByCampaignId.delete(campaigns[i].id);
      campaigns.splice(i, 1);
    }
  }
  return { removed: before - campaigns.length };
}

// Internal helper: append an event with a timestamp `secondsAgo` in the past
// so demo feeds tell a coherent timeline when first loaded.
function backdateEvent(
  campaignId: string,
  now: Date,
  secondsAgo: number,
  level: FeedEvent['level'],
  message: string
): void {
  const c = campaigns.find((x) => x.id === campaignId);
  if (!c) return;
  const fe: FeedEvent = {
    id: uid('fe'),
    timestamp: new Date(now.getTime() - secondsAgo * 1000).toISOString(),
    level,
    message,
  };
  c.feed.unshift(fe);
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
