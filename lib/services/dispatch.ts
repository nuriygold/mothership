import { prisma } from '@/lib/prisma';
import { DispatchCampaignStatus, DispatchTaskStatus, Prisma } from '@prisma/client';
import { dispatchToOpenClaw } from '@/lib/services/openclaw';

type RawPlanTask = {
  id?: string;
  key?: string;
  title: string;
  description?: string;
  deps?: string[];
  dependencies?: string[];
};

type RawPlan = {
  name?: string;
  tasks: RawPlanTask[];
  estimated_cost_cents?: number;
  estimated_duration_seconds?: number;
};

type RawPlanEnvelope = {
  plans: RawPlan[];
};

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenced?.[1] || text;
}

function asStringArray(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizePlanEnvelope(raw: RawPlanEnvelope) {
  return {
    plans: raw.plans.map((plan, planIndex) => {
      const keys = new Map<string, string>();
      const tasks = plan.tasks.map((task, taskIndex) => {
        const key = task.key || task.id || `task-${taskIndex + 1}`;
        keys.set(key, key);
        return {
          key,
          title: task.title.trim(),
          description: task.description?.trim() || null,
          dependencies: (task.deps || task.dependencies || []).filter(Boolean),
        };
      });

      return {
        name: plan.name?.trim() || `Plan ${String.fromCharCode(65 + planIndex)}`,
        estimated_cost_cents: plan.estimated_cost_cents ?? null,
        estimated_duration_seconds: plan.estimated_duration_seconds ?? null,
        tasks: tasks.map((task) => ({
          ...task,
          dependencies: task.dependencies.filter((dependency) => keys.has(dependency)),
        })),
      };
    }),
  };
}

export async function listDispatchCampaigns() {
  return prisma.dispatchCampaign.findMany({
    include: {
      tasks: {
        orderBy: [{ createdAt: 'asc' }],
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getDispatchCampaign(id: string) {
  return prisma.dispatchCampaign.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: [{ createdAt: 'asc' }],
      },
    },
  });
}

export async function createDispatchCampaign(input: {
  title: string;
  description?: string;
  costBudgetCents?: number;
  timeBudgetSeconds?: number;
  callbackUrl?: string;
  callbackSecret?: string;
}) {
  const campaign = await prisma.dispatchCampaign.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      costBudgetCents: input.costBudgetCents ?? null,
      timeBudgetSeconds: input.timeBudgetSeconds ?? null,
      callbackUrl: input.callbackUrl?.trim() || null,
      callbackSecret: input.callbackSecret?.trim() || null,
    },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'dispatch_campaign',
      entityId: campaign.id,
      eventType: 'created',
      metadata: {
        title: campaign.title,
      },
    },
  });

  return campaign;
}

export async function createDispatchTask(
  campaignId: string,
  input: {
    title: string;
    description?: string;
    priority?: number;
    dependencies?: string[];
    toolRequirements?: string[];
  }
) {
  const task = await prisma.dispatchTask.create({
    data: {
      campaignId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: input.priority ?? 5,
      dependencies: input.dependencies?.length ? input.dependencies : [],
      toolRequirements: input.toolRequirements?.length ? input.toolRequirements : [],
    },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'dispatch_task',
      entityId: task.id,
      eventType: 'created',
      metadata: {
        campaignId,
        title: task.title,
      },
    },
  });

  return task;
}

export async function generateDispatchPlans(campaignId: string) {
  const campaign = await prisma.dispatchCampaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  await prisma.dispatchCampaign.update({
    where: { id: campaignId },
    data: { status: DispatchCampaignStatus.PLANNING },
  });

  const prompt = [
    'You are planning a dispatch campaign.',
    `Goal: ${campaign.title}`,
    campaign.description ? `Context: ${campaign.description}` : null,
    'Return strict JSON only.',
    'Schema:',
    '{"plans":[{"name":"Plan A","tasks":[{"key":"task-1","title":"Short title","description":"Optional detail","deps":["task-0"]}],"estimated_cost_cents":0,"estimated_duration_seconds":0}]}',
    'Include 3 alternative plans. Dependencies must reference keys in the same plan.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await dispatchToOpenClaw({
      text: prompt,
      agentId: 'emerald',
      sessionKey: `dispatch-plan:${campaignId}`,
    });

    const parsed = JSON.parse(extractJson(result.output || ''));
    if (!parsed || !Array.isArray(parsed.plans) || parsed.plans.length === 0) {
      throw new Error('Planner did not return a usable plan set');
    }

    const latestPlan = normalizePlanEnvelope(parsed as RawPlanEnvelope);

    const updatedCampaign = await prisma.dispatchCampaign.update({
      where: { id: campaignId },
      data: {
        status: DispatchCampaignStatus.READY,
        latestPlan,
        latestPlanCreatedAt: new Date(),
      },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'dispatch_campaign',
        entityId: campaignId,
        eventType: 'plan.generated',
        metadata: {
          planCount: latestPlan.plans.length,
          agentId: result.agentId,
        },
      },
    });

    return {
      campaign: updatedCampaign,
      plans: latestPlan.plans,
    };
  } catch (error) {
    await prisma.dispatchCampaign.update({
      where: { id: campaignId },
      data: { status: campaign.status },
    });
    throw error;
  }
}

export async function approveDispatchPlan(campaignId: string, planName?: string) {
  const campaign = await prisma.dispatchCampaign.findUnique({
    where: { id: campaignId },
    include: { tasks: true },
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const latestPlan = campaign.latestPlan as Prisma.JsonObject | null;
  const plans = Array.isArray(latestPlan?.plans) ? (latestPlan?.plans as Prisma.JsonArray) : [];
  const selected = plans.find((plan) => {
    if (!plan || typeof plan !== 'object') return false;
    const name = (plan as Prisma.JsonObject).name;
    return planName ? name === planName : true;
  }) as Prisma.JsonObject | undefined;

  if (!selected) {
    throw new Error('No matching plan available');
  }

  const selectedPlanName = typeof selected.name === 'string' ? selected.name : 'Plan A';
  const selectedTasks = Array.isArray(selected.tasks) ? (selected.tasks as Prisma.JsonArray) : [];

  await prisma.$transaction(async (tx) => {
    await tx.dispatchTask.deleteMany({ where: { campaignId } });

    for (const rawTask of selectedTasks) {
      if (!rawTask || typeof rawTask !== 'object') continue;
      const task = rawTask as Prisma.JsonObject;
      const title = typeof task.title === 'string' ? task.title.trim() : '';
      if (!title) continue;
      await tx.dispatchTask.create({
        data: {
          campaignId,
          title,
          description: typeof task.description === 'string' ? task.description.trim() : null,
          dependencies: asStringArray(task.dependencies),
          status: DispatchTaskStatus.PLANNED,
        },
      });
    }

    await tx.dispatchCampaign.update({
      where: { id: campaignId },
      data: {
        status: DispatchCampaignStatus.EXECUTING,
        approvedPlanName: selectedPlanName,
        approvedPlanAt: new Date(),
      },
    });

    await tx.auditEvent.create({
      data: {
        entityType: 'dispatch_campaign',
        entityId: campaignId,
        eventType: 'plan.approved',
        metadata: {
          planName: selectedPlanName,
          taskCount: selectedTasks.length,
        },
      },
    });
  });

  return getDispatchCampaign(campaignId);
}

export async function setDispatchCampaignStatus(campaignId: string, status: DispatchCampaignStatus) {
  const campaign = await prisma.dispatchCampaign.update({
    where: { id: campaignId },
    data: { status },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'dispatch_campaign',
      entityId: campaignId,
      eventType: `status.${status.toLowerCase()}`,
    },
  });

  return campaign;
}

export async function getDispatchCampaignProgress(campaignId: string) {
  const tasks = await prisma.dispatchTask.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
  });

  const totals = tasks.reduce<Record<string, number>>((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});

  const completed = totals[DispatchTaskStatus.DONE] || 0;
  const total = tasks.length;

  return {
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
    byStatus: totals,
    tasks,
  };
}
