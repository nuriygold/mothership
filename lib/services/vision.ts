import { prisma } from '@/lib/prisma';
import { VisionPillarColor, VisionItemStatus } from '@prisma/client';

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

export async function getOrCreateVisionBoard() {
  const existing = await prisma.visionBoard.findFirst();
  if (existing) return existing;

  const board = await prisma.visionBoard.create({
    data: { title: 'My Vision' },
  });

  await prisma.visionPillar.createMany({
    data: DEFAULT_PILLARS.map((p) => ({ ...p, boardId: board.id })),
  });

  return board;
}

export async function listVisionPillars(boardId: string) {
  return prisma.visionPillar.findMany({
    where: { boardId },
    orderBy: { sortOrder: 'asc' },
    include: {
      items: {
        orderBy: { sortOrder: 'asc' },
        include: {
          campaignLinks: true,
          financePlanLinks: true,
          taskLinks: true,
        },
      },
    },
  });
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
  const pillar = await prisma.visionPillar.create({
    data: {
      boardId,
      label: input.label.trim(),
      emoji: input.emoji?.trim() || null,
      color: input.color ?? 'LAVENDER',
      sortOrder: input.sortOrder ?? 0,
    },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'vision_pillar',
      entityId: pillar.id,
      eventType: 'created',
      metadata: { label: pillar.label },
    },
  });

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
  return prisma.visionPillar.update({
    where: { id },
    data: {
      ...(input.label !== undefined && { label: input.label.trim() }),
      ...(input.emoji !== undefined && { emoji: input.emoji }),
      ...(input.color !== undefined && { color: input.color }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    },
  });
}

export async function deleteVisionPillar(id: string) {
  await prisma.auditEvent.create({
    data: {
      entityType: 'vision_pillar',
      entityId: id,
      eventType: 'deleted',
    },
  });
  return prisma.visionPillar.delete({ where: { id } });
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
  const item = await prisma.visionItem.create({
    data: {
      pillarId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: input.status ?? 'DREAMING',
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
      imageEmoji: input.imageEmoji?.trim() || null,
      notes: input.notes?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'vision_item',
      entityId: item.id,
      eventType: 'created',
      metadata: { title: item.title, pillarId },
    },
  });

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
  const item = await prisma.visionItem.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.targetDate !== undefined && {
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
      }),
      ...(input.imageEmoji !== undefined && { imageEmoji: input.imageEmoji }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
    },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'vision_item',
      entityId: id,
      eventType: 'updated',
      metadata: { title: item.title },
    },
  });

  return item;
}

export async function deleteVisionItem(id: string) {
  await prisma.auditEvent.create({
    data: {
      entityType: 'vision_item',
      entityId: id,
      eventType: 'deleted',
    },
  });
  return prisma.visionItem.delete({ where: { id } });
}

export async function getVisionItemWithLinks(id: string) {
  return prisma.visionItem.findUnique({
    where: { id },
    include: {
      pillar: true,
      campaignLinks: true,
      financePlanLinks: true,
    },
  });
}

export async function linkCampaignToItem(visionItemId: string, campaignId: string) {
  const link = await prisma.visionCampaignLink.upsert({
    where: { visionItemId_campaignId: { visionItemId, campaignId } },
    create: { visionItemId, campaignId },
    update: {},
  });

  // Soft-link the campaign back to the vision item
  await prisma.dispatchCampaign.update({
    where: { id: campaignId },
    data: { visionItemId },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'vision_item',
      entityId: visionItemId,
      eventType: 'campaign_linked',
      metadata: { campaignId },
    },
  });

  return link;
}

export async function unlinkCampaignFromItem(visionItemId: string, campaignId: string) {
  await prisma.visionCampaignLink.deleteMany({
    where: { visionItemId, campaignId },
  });

  // Clear the soft-link on the campaign if it still points to this item
  await prisma.dispatchCampaign.updateMany({
    where: { id: campaignId, visionItemId },
    data: { visionItemId: null },
  });
}

export async function linkFinancePlanToItem(visionItemId: string, financePlanId: string) {
  const link = await prisma.visionFinancePlanLink.upsert({
    where: { visionItemId_financePlanId: { visionItemId, financePlanId } },
    create: { visionItemId, financePlanId },
    update: {},
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'vision_item',
      entityId: visionItemId,
      eventType: 'finance_plan_linked',
      metadata: { financePlanId },
    },
  });

  return link;
}

export async function unlinkFinancePlanFromItem(visionItemId: string, financePlanId: string) {
  return prisma.visionFinancePlanLink.deleteMany({
    where: { visionItemId, financePlanId },
  });
}

export async function linkTaskToItem(visionItemId: string, taskId: string) {
  const link = await prisma.visionTaskLink.upsert({
    where: { visionItemId_taskId: { visionItemId, taskId } },
    create: { visionItemId, taskId },
    update: {},
  });

  await prisma.task.update({ where: { id: taskId }, data: { visionItemId } });

  await prisma.auditEvent.create({
    data: {
      entityType: 'vision_item',
      entityId: visionItemId,
      eventType: 'task_linked',
      metadata: { taskId },
    },
  });

  return link;
}

export async function unlinkTaskFromItem(visionItemId: string, taskId: string) {
  await prisma.visionTaskLink.deleteMany({ where: { visionItemId, taskId } });
  await prisma.task.updateMany({
    where: { id: taskId, visionItemId },
    data: { visionItemId: null },
  });
}
