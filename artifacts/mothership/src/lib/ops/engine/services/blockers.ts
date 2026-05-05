import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  mcBlockers,
  type BlockerStatus,
  type McBlocker,
  type McBlockerInsert,
} from '../../../db/dispatch-schema';
import { record } from './events';

export async function listOpenBlockers(campaignId: string): Promise<McBlocker[]> {
  return db
    .select()
    .from(mcBlockers)
    .where(and(eq(mcBlockers.campaignId, campaignId), eq(mcBlockers.status, 'open')))
    .orderBy(desc(mcBlockers.createdAt));
}

export async function listAllBlockers(campaignId: string): Promise<McBlocker[]> {
  return db
    .select()
    .from(mcBlockers)
    .where(eq(mcBlockers.campaignId, campaignId))
    .orderBy(desc(mcBlockers.createdAt));
}

export async function createBlocker(input: McBlockerInsert): Promise<McBlocker> {
  const [row] = await db.insert(mcBlockers).values(input).returning();
  await record(
    input.campaignId,
    'blocker_created',
    `Blocker created: ${row.summary}`,
    {
      blockerId: row.id,
      severity: row.severity,
      attemptedMethod: row.attemptedMethod,
    },
  );
  return row;
}

export async function setBlockerStatus(
  blockerId: string,
  status: BlockerStatus,
  resolverNote?: string,
): Promise<McBlocker | undefined> {
  const [row] = await db
    .update(mcBlockers)
    .set({
      status,
      resolvedAt: status === 'resolved' || status === 'dismissed' ? new Date() : null,
    })
    .where(eq(mcBlockers.id, blockerId))
    .returning();
  if (!row) return undefined;
  if (status === 'resolved' || status === 'dismissed') {
    await record(
      row.campaignId,
      'blocker_resolved',
      `Blocker ${status}: ${row.summary}${resolverNote ? ` — ${resolverNote}` : ''}`,
      { blockerId: row.id, status },
    );
  }
  return row;
}

export async function resolveAllBlockersForCampaign(campaignId: string): Promise<number> {
  const open = await listOpenBlockers(campaignId);
  for (const b of open) {
    await setBlockerStatus(b.id, 'resolved', 'force-resolved by operator');
  }
  return open.length;
}
