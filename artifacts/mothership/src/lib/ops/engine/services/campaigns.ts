import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import {
  mcCampaignAgents,
  mcCampaigns,
  type CampaignStatus,
  type McCampaign,
  type McCampaignAgent,
  type McCampaignInsert,
} from '../../../db/dispatch-schema';
import { record } from './events';

export type CreateCampaignArgs = Omit<McCampaignInsert, 'id' | 'createdAt' | 'updatedAt'> & {
  leadAgentId?: string;
};

export async function listCampaigns(): Promise<McCampaign[]> {
  return db.select().from(mcCampaigns).orderBy(desc(mcCampaigns.createdAt));
}

export async function getCampaign(id: string): Promise<McCampaign | undefined> {
  const rows = await db.select().from(mcCampaigns).where(eq(mcCampaigns.id, id)).limit(1);
  return rows[0];
}

export async function listCampaignsByStatus(statuses: CampaignStatus[]): Promise<McCampaign[]> {
  if (statuses.length === 0) return [];
  return db
    .select()
    .from(mcCampaigns)
    .where(inArray(mcCampaigns.status, statuses))
    .orderBy(desc(mcCampaigns.createdAt));
}

export async function createCampaign(args: CreateCampaignArgs): Promise<McCampaign> {
  const { leadAgentId, ...rest } = args;
  const [row] = await db.insert(mcCampaigns).values(rest).returning();

  await record(row.id, 'campaign_created', `Campaign created: ${row.name}`, {
    campaignType: row.campaignType,
    priority: row.priority,
  });

  if (leadAgentId) {
    await assignAgent(row.id, leadAgentId, 'owner', true);
  }

  return row;
}

export async function setStatus(
  id: string,
  status: CampaignStatus,
  message?: string,
): Promise<McCampaign | undefined> {
  const patch: Partial<McCampaign> = {
    status,
    updatedAt: new Date(),
  };
  if (status === 'running' && (await getCampaign(id))?.startedAt == null) {
    patch.startedAt = new Date();
  }
  if (status === 'completed' || status === 'failed' || status === 'archived') {
    patch.completedAt = new Date();
  }

  const [row] = await db.update(mcCampaigns).set(patch).where(eq(mcCampaigns.id, id)).returning();
  if (!row) return undefined;

  const eventType =
    status === 'running' ? 'campaign_started'
    : status === 'paused' ? 'campaign_paused'
    : status === 'completed' ? 'campaign_completed'
    : status === 'failed' ? 'campaign_failed'
    : status === 'archived' ? 'campaign_cancelled'
    : status === 'queued' ? 'campaign_queued'
    : status === 'approved' ? 'campaign_approved'
    : 'campaign_updated';

  await record(id, eventType, message ?? `Status: ${status}`, { status });
  return row;
}

export async function setProgressSummary(
  id: string,
  progress: { progress: number; filesUpdated?: number; rowsProcessed?: number; batchCount?: number },
): Promise<void> {
  await db
    .update(mcCampaigns)
    .set({ progressSummary: progress, updatedAt: new Date() })
    .where(eq(mcCampaigns.id, id));
}

export async function assignAgent(
  campaignId: string,
  agentId: string,
  role: 'owner' | 'executor' | 'reviewer' | 'validator' | 'supervisor' | 'fallback' | 'observer' = 'owner',
  isPrimary = false,
): Promise<McCampaignAgent> {
  // Demote other primaries if making this primary.
  if (isPrimary) {
    await db
      .update(mcCampaignAgents)
      .set({ isPrimary: false })
      .where(eq(mcCampaignAgents.campaignId, campaignId));
  }
  const existing = await db
    .select()
    .from(mcCampaignAgents)
    .where(
      and(
        eq(mcCampaignAgents.campaignId, campaignId),
        eq(mcCampaignAgents.agentId, agentId),
        eq(mcCampaignAgents.assignmentRole, role),
      ),
    )
    .limit(1);
  if (existing[0]) {
    if (existing[0].isPrimary !== isPrimary) {
      const [updated] = await db
        .update(mcCampaignAgents)
        .set({ isPrimary })
        .where(eq(mcCampaignAgents.id, existing[0].id))
        .returning();
      return updated;
    }
    return existing[0];
  }
  const [row] = await db
    .insert(mcCampaignAgents)
    .values({ campaignId, agentId, assignmentRole: role, isPrimary })
    .returning();
  await record(campaignId, 'agent_assigned', `Agent assigned (${role})`, {
    agentId,
    role,
    isPrimary,
  });
  return row;
}

export async function getPrimaryAgentId(campaignId: string): Promise<string | undefined> {
  const rows = await db
    .select()
    .from(mcCampaignAgents)
    .where(and(eq(mcCampaignAgents.campaignId, campaignId), eq(mcCampaignAgents.isPrimary, true)))
    .limit(1);
  return rows[0]?.agentId;
}

export async function listCampaignAgents(campaignId: string): Promise<McCampaignAgent[]> {
  return db
    .select()
    .from(mcCampaignAgents)
    .where(eq(mcCampaignAgents.campaignId, campaignId));
}
