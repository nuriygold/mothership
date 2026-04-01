import { prisma } from '@/lib/prisma';
import { WorkflowStatus, WorkflowType, Prisma } from '@prisma/client';

export async function listWorkflows() {
  return prisma.workflow.findMany({
    include: {
      owner: true,
      currentSchemaVersion: true,
      submissions: true,
      runs: true,
      tasks: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getWorkflow(id: string) {
  return prisma.workflow.findUnique({
    where: { id },
    include: {
      owner: true,
      currentSchemaVersion: true,
      submissions: {
        orderBy: { submittedAt: 'desc' },
      },
      runs: true,
      tasks: true,
    },
  });
}

export async function createWorkflow(input: {
  name: string;
  description?: string;
  type?: WorkflowType;
  ownerId: string;
  status?: WorkflowStatus;
  schemaJson?: Prisma.InputJsonValue;
}) {
  const workflow = await prisma.workflow.create({
    data: {
      name: input.name,
      description: input.description,
      type: input.type ?? WorkflowType.STANDARD,
      status: input.status ?? WorkflowStatus.ACTIVE,
      ownerId: input.ownerId,
    },
  });

  if (input.schemaJson) {
    const schema = await prisma.workflowSchemaVersion.create({
      data: {
        workflowId: workflow.id,
        version: 1,
        schemaJson: input.schemaJson,
      },
    });

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { currentSchemaVersionId: schema.id },
    });
  }

  return workflow;
}
