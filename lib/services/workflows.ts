import { prisma } from '@/lib/prisma';
import { WorkflowStatus, WorkflowType, Prisma } from '@prisma/client';
import { getTaskPoolWorkflow, isTaskPoolRepositorySource, listTaskPoolWorkflows } from '@/lib/integrations/task-pool';

export async function listWorkflows() {
  if (isTaskPoolRepositorySource()) {
    const repositoryWorkflows = await listTaskPoolWorkflows();
    if (repositoryWorkflows) return repositoryWorkflows;
    return [];
  }

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
  if (isTaskPoolRepositorySource()) {
    if (!id.startsWith('tpw_')) return null;
    const repositoryWorkflow = await getTaskPoolWorkflow(id);
    if (repositoryWorkflow) return repositoryWorkflow;
    return null;
  }

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
