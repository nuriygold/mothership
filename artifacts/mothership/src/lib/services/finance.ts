import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { FinancePlanStatus, FinancePlanType } from '@/lib/db/enums';
import { and, desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

export async function listFinancePlans(statusFilter?: FinancePlanStatus) {
  const where = statusFilter ? eq(schema.financePlans.status, statusFilter) : undefined;
  return db.select()
    .from(schema.financePlans)
    .where(where)
    .orderBy(desc(schema.financePlans.createdAt));
}

export async function createFinancePlan(input: {
  title: string;
  type?: FinancePlanType;
  status?: FinancePlanStatus;
  description?: string;
  goal?: string;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  startDate?: Date;
  targetDate?: Date;
  managedByBot?: string;
  milestones?: Array<{ label: string; targetValue?: number; completedAt?: string }>;
  notes?: string;
  sourceFile?: string;
}) {
  const [created] = await db.insert(schema.financePlans).values({
    id: randomUUID(),
    title: input.title,
    type: input.type ?? FinancePlanType.CUSTOM,
    status: input.status ?? FinancePlanStatus.ACTIVE,
    description: input.description ?? null,
    goal: input.goal ?? null,
    currentValue: input.currentValue ?? null,
    targetValue: input.targetValue ?? null,
    unit: input.unit ?? null,
    startDate: input.startDate ?? null,
    targetDate: input.targetDate ?? null,
    managedByBot: input.managedByBot ?? 'emerald',
    milestones: input.milestones ?? [],
    notes: input.notes ?? null,
    sourceFile: input.sourceFile ?? null,
    updatedAt: new Date(),
  }).returning();
  return created;
}

export async function updateFinancePlan(
  id: string,
  input: {
    status?: FinancePlanStatus;
    currentValue?: number;
    notes?: string;
    milestones?: Array<{ label: string; targetValue?: number; completedAt?: string }>;
  }
) {
  const updates: Partial<typeof schema.financePlans.$inferInsert> = {};
  if (input.status !== undefined) updates.status = input.status;
  if (input.currentValue !== undefined) updates.currentValue = input.currentValue;
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.milestones !== undefined) updates.milestones = input.milestones;
  updates.updatedAt = new Date();

  const [updated] = await db.update(schema.financePlans)
    .set(updates)
    .where(eq(schema.financePlans.id, id))
    .returning();
  return updated;
}

export async function upsertFinancePlanBySourceFile(
  sourceFile: string,
  input: Parameters<typeof createFinancePlan>[0]
) {
  const [existing] = await db.select()
    .from(schema.financePlans)
    .where(eq(schema.financePlans.sourceFile, sourceFile))
    .limit(1);

  if (existing) {
    const updates: Partial<typeof schema.financePlans.$inferInsert> = {
      title: input.title,
      type: input.type ?? existing.type as FinancePlanType,
      description: input.description ?? existing.description,
      goal: input.goal ?? existing.goal,
      currentValue: input.currentValue ?? existing.currentValue,
      targetValue: input.targetValue ?? existing.targetValue,
      unit: input.unit ?? existing.unit,
      startDate: input.startDate ?? existing.startDate,
      targetDate: input.targetDate ?? existing.targetDate,
      managedByBot: input.managedByBot ?? existing.managedByBot,
      milestones: input.milestones ?? existing.milestones,
      notes: input.notes ?? existing.notes,
      updatedAt: new Date(),
    };
    const [updated] = await db.update(schema.financePlans)
      .set(updates)
      .where(eq(schema.financePlans.id, existing.id))
      .returning();
    return updated;
  }
  return createFinancePlan({ ...input, sourceFile });
}
