import { prisma } from '@/lib/prisma';
import { ApprovalDecision } from '@/lib/db/prisma-types';

export async function listApprovals() {
  return prisma.approval.findMany({
    include: { workflow: true, task: true, requestedBy: true, decidedBy: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function requestApproval(input: {
  workflowId?: string | null;
  taskId?: string | null;
  requestedById?: string | null;
  reason?: string | null;
}) {
  return prisma.approval.create({
    data: {
      workflowId: input.workflowId ?? null,
      taskId: input.taskId ?? null,
      requestedById: input.requestedById ?? null,
      reason: input.reason ?? null,
    },
  });
}

export async function decideApproval(id: string, decision: ApprovalDecision, decidedById?: string | null) {
  return prisma.approval.update({
    where: { id },
    data: { status: decision, decidedById: decidedById ?? null, decidedAt: new Date() },
  });
}
