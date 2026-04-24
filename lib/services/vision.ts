import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  auditEvents,
  dispatchCampaigns,
  tasks,
  visionBoards,
  visionCampaignLinks,
  visionFinancePlanLinks,
  visionItems,
  visionPillars,
  visionTaskLinks,
} from '@/lib/db/schema';
import { VisionPillarColor, VisionItemStatus } from '@/lib/db/prisma-types';

const DEFAULT_PILLARS: Array<{
  label: string;
  emoji: string;
  color: VisionPillarColor;
  sortOrder: number;
}> = [
  { label: 'Wealth', emoji: '💰', color: 'MINT', sortOrder: 0 },
  { label: 'Freedom', emoji: '🕊️', color: 'LAVENDER', sortOrder: 1 },
  { label: 'Health', emoji: '🏃', color: 'SKY', sortOrder: 2 },
  { label: 'Legacy', emoji: '🌱', color: 'PEACH', sortOrder: 3 },
  { label: 'Creative', emoji: '🎨', color: 'PINK', sortOrder: 4 },
  { label: 'Business', emoji: '🏢', color: 'LEMON', sortOrder: 5 },
];

async function createAuditEvent(entityType: string, entityId: string, eventType: string, metadata?: unknown) {
  await db.insert(auditEvents).values({
    entityType,
    entityId,
    eventType,
    metadata: metadata === undefined ? null : JSON.stringify(metadata),
  });
}

export async function getVisionItem(id: string) {
  const [item] = await db.select().from(visionItems).where(eq(visionItems.id, id)).limit(1);
  return item ?? null;
}

export async function getOrCreateVisionBoard() {
  const [existing] = await db.select().from(visionBoards).orderBy(asc(visionBoards.createdAt)).limit(1);
  if (existing) return existing;

  const [board] = await db.insert(visionBoards).values({ title: 'My Vision' }).returning();

  await db.insert(visionPillars).values(
    DEFAULT_PILLARS.map((pillar) => ({
      ...pillar,
      boardId: board.id,
    }))
  );

  return board;
}

export async function listVisionPillars(boardId: string) {
  const pillars = await db
    .select()
    .from(visionPillars)
    .where(eq(visionPillars.boardId, boardId))
    .orderBy(asc(visionPillars.sortOrder));

  if (!pillars.length) return [];

  const pillarIds = pillars.map((pillar) => pillar.id);
  const items = await db
    .select()
    .from(visionItems)
    .where(inArray(visionItems.pillarId, pillarIds))
    .orderBy(asc(visionItems.sortOrder));

  const itemIds = items.map((item) => item.id);
  const [campaignLinks, financePlanLinks, taskLinks] = itemIds.length
    ? await Promise.all([
        db.select().from(visionCampaignLinks).where(inArray(visionCampaignLinks.visionItemId, itemIds)),
        db.select().from(visionFinancePlanLinks).where(inArray(visionFinancePlanLinks.visionItemId, itemIds)),
        db.select().from(visionTaskLinks).where(inArray(visionTaskLinks.visionItemId, itemIds)),
      ])
    : [[], [], []];

  const itemsByPillar = new Map<string, Array<typeof items[number] & {
    campaignLinks: typeof campaignLinks;
    financePlanLinks: typeof financePlanLinks;
    taskLinks: typeof taskLinks;
  }>>();

  for (const item of items) {
    const enriched = {
      ...item,
      campaignLinks: campaignLinks.filter((link) => link.visionItemId === item.id),
      financePlanLinks: financePlanLinks.filter((link) => link.visionItemId === item.id),
      taskLinks: taskLinks.filter((link) => link.visionItemId === item.id),
    };
    const bucket = itemsByPillar.get(item.pillarId) ?? [];
    bucket.push(enriched);
    itemsByPillar.set(item.pillarId, bucket);
  }

  return pillars.map((pillar) => ({
    ...pillar,
    items: itemsByPillar.get(pillar.id) ?? [],
  }));
}

export async function createVisionPillar(
  boardId: string,
  input: {
    label: string;
    emoji?: string;
    color?: VisionPillarColor;
    sortOrder?: number;
  }
) {
  const [pillar] = await db
    .insert(visionPillars)
    .values({
      boardId,
      label: input.label.trim(),
      emoji: input.emoji?.trim() || null,
      color: input.color ?? 'LAVENDER',
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  await createAuditEvent('vision_pillar', pillar.id, 'created', { label: pillar.label });
  return pillar;
}

export async function updateVisionPillar(
  id: string,
  input: {
    label?: string;
    emoji?: string | null;
    color?: VisionPillarColor;
    sortOrder?: number;
  }
) {
  const updates: Partial<typeof visionPillars.$inferInsert> = { updatedAt: new Date() };
  if (input.label !== undefined) updates.label = input.label.trim();
  if (input.emoji !== undefined) updates.emoji = input.emoji;
  if (input.color !== undefined) updates.color = input.color;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

  const [pillar] = await db.update(visionPillars).set(updates).where(eq(visionPillars.id, id)).returning();
  return pillar;
}

export async function deleteVisionPillar(id: string) {
  await createAuditEvent('vision_pillar', id, 'deleted');
  await db.delete(visionPillars).where(eq(visionPillars.id, id));
}

export async function createVisionItem(
  pillarId: string,
  input: {
    title: string;
    description?: string;
    status?: VisionItemStatus;
    targetDate?: string;
    imageEmoji?: string;
    notes?: string;
    sortOrder?: number;
  }
) {
  const [item] = await db
    .insert(visionItems)
    .values({
      pillarId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: input.status ?? 'DREAMING',
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
      imageEmoji: input.imageEmoji?.trim() || null,
      notes: input.notes?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  await createAuditEvent('vision_item', item.id, 'created', { title: item.title, pillarId });
  return item;
}

export async function updateVisionItem(
  id: string,
  input: {
    title?: string;
    description?: string | null;
    status?: VisionItemStatus;
    targetDate?: string | null;
    imageEmoji?: string | null;
    notes?: string | null;
    sortOrder?: number;
  }
) {
  const updates: Partial<typeof visionItems.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) updates.title = input.title.trim();
  if (input.description !== undefined) updates.description = input.description;
  if (input.status !== undefined) updates.status = input.status;
  if (input.targetDate !== undefined) updates.targetDate = input.targetDate ? new Date(input.targetDate) : null;
  if (input.imageEmoji !== undefined) updates.imageEmoji = input.imageEmoji;
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;

  const [item] = await db.update(visionItems).set(updates).where(eq(visionItems.id, id)).returning();
  await createAuditEvent('vision_item', id, 'updated', { title: item?.title });
  return item;
}

export async function deleteVisionItem(id: string) {
  await createAuditEvent('vision_item', id, 'deleted');
  await db.delete(visionItems).where(eq(visionItems.id, id));
}

export async function getVisionItemWithLinks(id: string) {
  const [item] = await db.select().from(visionItems).where(eq(visionItems.id, id)).limit(1);
  if (!item) return null;

  const [pillar] = await db.select().from(visionPillars).where(eq(visionPillars.id, item.pillarId)).limit(1);
  const [campaignLinks, financePlanLinks, taskLinks] = await Promise.all([
    db.select().from(visionCampaignLinks).where(eq(visionCampaignLinks.visionItemId, id)),
    db.select().from(visionFinancePlanLinks).where(eq(visionFinancePlanLinks.visionItemId, id)),
    db.select().from(visionTaskLinks).where(eq(visionTaskLinks.visionItemId, id)),
  ]);

  return {
    ...item,
    pillar,
    campaignLinks,
    financePlanLinks,
    taskLinks,
  };
}

export async function linkCampaignToItem(visionItemId: string, campaignId: string) {
  await db
    .insert(visionCampaignLinks)
    .values({ visionItemId, campaignId })
    .onConflictDoNothing({
      target: [visionCampaignLinks.visionItemId, visionCampaignLinks.campaignId],
    });

  await db.update(dispatchCampaigns).set({ visionItemId, updatedAt: new Date() }).where(eq(dispatchCampaigns.id, campaignId));

  await createAuditEvent('vision_item', visionItemId, 'campaign_linked', { campaignId });

  const [link] = await db
    .select()
    .from(visionCampaignLinks)
    .where(and(eq(visionCampaignLinks.visionItemId, visionItemId), eq(visionCampaignLinks.campaignId, campaignId)))
    .limit(1);

  return link;
}

export async function unlinkCampaignFromItem(visionItemId: string, campaignId: string) {
  await db
    .delete(visionCampaignLinks)
    .where(and(eq(visionCampaignLinks.visionItemId, visionItemId), eq(visionCampaignLinks.campaignId, campaignId)));

  await db
    .update(dispatchCampaigns)
    .set({ visionItemId: null, updatedAt: new Date() })
    .where(and(eq(dispatchCampaigns.id, campaignId), eq(dispatchCampaigns.visionItemId, visionItemId)));
}

export async function linkFinancePlanToItem(visionItemId: string, financePlanId: string) {
  await db
    .insert(visionFinancePlanLinks)
    .values({ visionItemId, financePlanId })
    .onConflictDoNothing({
      target: [visionFinancePlanLinks.visionItemId, visionFinancePlanLinks.financePlanId],
    });

  await createAuditEvent('vision_item', visionItemId, 'finance_plan_linked', { financePlanId });

  const [link] = await db
    .select()
    .from(visionFinancePlanLinks)
    .where(
      and(
        eq(visionFinancePlanLinks.visionItemId, visionItemId),
        eq(visionFinancePlanLinks.financePlanId, financePlanId)
      )
    )
    .limit(1);

  return link;
}

export async function unlinkFinancePlanFromItem(visionItemId: string, financePlanId: string) {
  await db
    .delete(visionFinancePlanLinks)
    .where(
      and(
        eq(visionFinancePlanLinks.visionItemId, visionItemId),
        eq(visionFinancePlanLinks.financePlanId, financePlanId)
      )
    );
}

export async function linkTaskToItem(visionItemId: string, taskId: string) {
  await db
    .insert(visionTaskLinks)
    .values({ visionItemId, taskId })
    .onConflictDoNothing({
      target: [visionTaskLinks.visionItemId, visionTaskLinks.taskId],
    });

  await db.update(tasks).set({ visionItemId, updatedAt: new Date() }).where(eq(tasks.id, taskId));

  await createAuditEvent('vision_item', visionItemId, 'task_linked', { taskId });

  const [link] = await db
    .select()
    .from(visionTaskLinks)
    .where(and(eq(visionTaskLinks.visionItemId, visionItemId), eq(visionTaskLinks.taskId, taskId)))
    .limit(1);

  return link;
}

export async function unlinkTaskFromItem(visionItemId: string, taskId: string) {
  await db
    .delete(visionTaskLinks)
    .where(and(eq(visionTaskLinks.visionItemId, visionItemId), eq(visionTaskLinks.taskId, taskId)));

  await db
    .update(tasks)
    .set({ visionItemId: null, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.visionItemId, visionItemId)));
}
