import { prisma } from '@/lib/prisma';
import { FinancePlanStatus, FinancePlanType } from '@/lib/db/prisma-types';

export async function listFinancePlans(statusFilter?: FinancePlanStatus) {
  return prisma.financePlan.findMany({
    where: statusFilter ? { status: statusFilter } : undefined,
    orderBy: { createdAt: 'desc' },
  });
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
  return prisma.financePlan.create({
    data: {
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
    },
  });
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
  return prisma.financePlan.update({
    where: { id },
    data: {
      status: input.status,
      currentValue: input.currentValue,
      notes: input.notes,
      milestones: input.milestones,
    },
  });
}

export async function upsertFinancePlanBySourceFile(
  sourceFile: string,
  input: Parameters<typeof createFinancePlan>[0]
) {
  const existing = await prisma.financePlan.findFirst({ where: { sourceFile } });
  if (existing) {
    return prisma.financePlan.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        type: input.type ?? existing.type,
        description: input.description ?? existing.description,
        goal: input.goal ?? existing.goal,
        currentValue: input.currentValue ?? existing.currentValue,
        targetValue: input.targetValue ?? existing.targetValue,
        unit: input.unit ?? existing.unit,
        startDate: input.startDate ?? existing.startDate,
        targetDate: input.targetDate ?? existing.targetDate,
        managedByBot: input.managedByBot ?? existing.managedByBot,
        milestones: (input.milestones ?? existing.milestones ?? []) as object[],
        notes: input.notes ?? existing.notes,
      },
    });
  }
  return createFinancePlan({ ...input, sourceFile });
}
