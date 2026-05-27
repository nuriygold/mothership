import { sql } from 'drizzle-orm';
import { db } from './db';
import { mcCampaigns } from '../../db/dispatch-schema';
import { getAgentByCodename, upsertAgent } from './services/agents';
import {
  assignAgent,
  createCampaign,
  setProgressSummary,
  setStatus,
} from './services/campaigns';
import { writeArtifact } from './services/artifacts';
import { createBlocker } from './services/blockers';
import { record } from './services/events';

const DEMO_AGENTS = [
  { codename: 'adrian', name: 'Adrian', role: 'Web extraction', capabilities: ['catalog audit', 'product extraction', 'browser fallback'] },
  { codename: 'ruby', name: 'Ruby', role: 'Outreach', capabilities: ['campaign drafting', 'creator outreach', 'content QA'] },
  { codename: 'iceman', name: 'Iceman', role: 'Build & deploy', capabilities: ['build orchestration', 'deploy gating', 'release notes'] },
  { codename: 'marvin', name: 'Marvin', role: 'Finance', capabilities: ['ledger reconciliation', 'payable scan', 'cash projection'] },
];

export async function ensureDemoAgents(): Promise<void> {
  for (const a of DEMO_AGENTS) {
    await upsertAgent({
      codename: a.codename,
      name: a.name,
      role: a.role,
      capabilities: a.capabilities,
      status: 'active',
      metadata: { demo: true },
    });
  }
}

export async function seedDemoCampaigns(): Promise<{ created: string[] }> {
  await ensureDemoAgents();
  await clearDemoCampaigns();

  const adrian = DEMO_AGENTS[0];
  const marvin = DEMO_AGENTS[3];
  const iceman = DEMO_AGENTS[2];

  const [adrianAgent, marvinAgent, icemanAgent] = await Promise.all([
    getAgentByCodename(adrian.codename),
    getAgentByCodename(marvin.codename),
    getAgentByCodename(iceman.codename),
  ]);

  const created: string[] = [];

  // ── Mission 1: RUNNING — Adrian Shopify audit ─────────────────────────────
  const m1 = await createCampaign({
    name: 'Demo: Shopify Catalog Audit',
    description: 'Audit live Shopify catalog for missing alt text, broken variant links, and pricing drift.',
    objective: 'Audit live Shopify catalog for missing alt text, broken variant links, and pricing drift.',
    campaignType: 'data_operation',
    status: 'queued',
    priority: 'medium',
    progressMode: 'artifact_completion',
    leadAgentId: adrianAgent?.id,
    metadata: {
      demo: true,
      demoNonRunnable: true,
      requiredArtifacts: ['products.md', 'action-log.md'],
      minimumBatchSize: 5,
      executionMode: 'STANDARD',
    },
  });

  await writeArtifact({
    campaignId: m1.id,
    artifactType: 'markdown',
    title: 'products.md',
    description: 'Catalog audit results',
    contentSummary: '# Catalog Audit · Products\n\n_184 products scanned · 23 issues flagged_',
    producedByAgentId: adrianAgent?.id,
    metadata: { demo: true, sizeBytes: 1820 },
  });
  await writeArtifact({
    campaignId: m1.id,
    artifactType: 'log',
    title: 'action-log.md',
    contentSummary: '# Action Log\n\n- Pulled 184 products\n- Ran alt-text checker\n- Flagged 6 high-severity 404s',
    producedByAgentId: adrianAgent?.id,
    metadata: { demo: true, sizeBytes: 240 },
  });
  await setStatus(m1.id, 'running', 'Demo: started');
  await setProgressSummary(m1.id, { progress: 0.62, filesUpdated: 2, rowsProcessed: 184, batchCount: 3 });
  created.push(m1.id);

  // ── Mission 2: BLOCKED — Marvin finance recon ─────────────────────────────
  const m2 = await createCampaign({
    name: 'Demo: Finance Recon (Apr 2026)',
    description: 'Reconcile April expense ledger against Teller feed.',
    objective: 'Reconcile April expense ledger against Teller feed.',
    campaignType: 'finance_audit',
    status: 'queued',
    priority: 'high',
    progressMode: 'mixed',
    leadAgentId: marvinAgent?.id,
    metadata: {
      demo: true,
      demoNonRunnable: true,
      requiredArtifacts: ['ledger-diff.md'],
      minimumBatchSize: 5,
      executionMode: 'STANDARD',
    },
  });
  await writeArtifact({
    campaignId: m2.id,
    artifactType: 'markdown',
    title: 'ledger-diff.md',
    contentSummary: '# April Reconciliation Diff\n\n_89 transactions reconciled · 4 unresolved_',
    producedByAgentId: marvinAgent?.id,
    metadata: { demo: true, sizeBytes: 480 },
  });
  await createBlocker({
    campaignId: m2.id,
    createdByAgentId: marvinAgent?.id,
    summary: 'Awaiting operator approval to cancel duplicate Notion subscription',
    severity: 'medium',
    attemptedMethod: 'pending_input',
    failureEvidence: { duplicate: 'Notion · $58/mo' },
    requiredResolution: 'approve | deny',
    canContinueElsewhere: false,
    status: 'open',
  });
  await setStatus(m2.id, 'blocked', 'Awaiting operator approval');
  await setProgressSummary(m2.id, { progress: 0.48, filesUpdated: 1, rowsProcessed: 89, batchCount: 2 });
  created.push(m2.id);

  // ── Mission 3: COMPLETED — Iceman deploy ──────────────────────────────────
  const m3 = await createCampaign({
    name: 'Demo: Mothership Deploy v0.142.0',
    description: 'Build, gate, and deploy mothership v0.142.0.',
    objective: 'Build, gate, and deploy mothership v0.142.0.',
    campaignType: 'task_orchestration',
    status: 'queued',
    priority: 'high',
    progressMode: 'event_milestone',
    leadAgentId: icemanAgent?.id,
    metadata: {
      demo: true,
      demoNonRunnable: true,
      requiredArtifacts: ['release-notes.md'],
      minimumBatchSize: 1,
      executionMode: 'STANDARD',
    },
  });
  await writeArtifact({
    campaignId: m3.id,
    artifactType: 'markdown',
    title: 'release-notes.md',
    contentSummary: '# v0.142.0\n\n- Added /ops control plane\n- Wired durable engine',
    producedByAgentId: icemanAgent?.id,
    metadata: { demo: true, sizeBytes: 320 },
  });
  await record(m3.id, 'execution_progress', 'Smoke suite passed (28/28)');
  await record(m3.id, 'execution_progress', 'next build complete · 12.4s');
  await setStatus(m3.id, 'completed', 'Demo: deploy verified');
  await setProgressSummary(m3.id, { progress: 1, filesUpdated: 1, rowsProcessed: 0, batchCount: 4 });
  created.push(m3.id);

  return { created };
}

export async function clearDemoCampaigns(): Promise<{ removed: number }> {
  // Resolve cascade-style by deleting children first; using raw SQL keeps it
  // simple and avoids needing fk constraints to be defined.
  const demoIds = await db
    .select({ id: mcCampaigns.id })
    .from(mcCampaigns)
    .where(sql`${mcCampaigns.metadata} ->> 'demo' = 'true'`);
  if (demoIds.length === 0) return { removed: 0 };
  const ids = demoIds.map((r) => r.id);

  await db.execute(sql`DELETE FROM campaign_events WHERE campaign_id = ANY(${ids})`);
  await db.execute(sql`DELETE FROM blockers WHERE campaign_id = ANY(${ids})`);
  await db.execute(sql`DELETE FROM execution_attempts WHERE campaign_id = ANY(${ids})`);
  await db.execute(sql`DELETE FROM artifacts WHERE campaign_id = ANY(${ids})`);
  await db.execute(sql`DELETE FROM campaign_agents WHERE campaign_id = ANY(${ids})`);
  await db.execute(sql`DELETE FROM resume_directives WHERE campaign_id = ANY(${ids})`);
  await db.execute(sql`DELETE FROM approvals WHERE campaign_id = ANY(${ids})`);
  await db.execute(sql`DELETE FROM artifact_validations WHERE campaign_id = ANY(${ids})`);
  await db.execute(sql`DELETE FROM campaign_sources WHERE campaign_id = ANY(${ids})`);
  await db.execute(sql`DELETE FROM campaign_tags WHERE campaign_id = ANY(${ids})`);
  await db.execute(sql`DELETE FROM campaigns WHERE id = ANY(${ids})`);

  return { removed: ids.length };
}
