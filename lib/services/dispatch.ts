import { createHmac } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { DispatchCampaignStatus, DispatchTaskStatus, Prisma, TaskPriority } from '@prisma/client';
import { dispatchToOpenClaw, dispatchWithTools } from '@/lib/services/openclaw';
import { closeTaskPoolIssueWithOutput, createTaskPoolIssue } from '@/lib/integrations/task-pool';
import { buildToolsBlock, getToolsForRequirements } from '@/lib/tools/registry';

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
    'You are breaking a goal into discrete tasks that an AI assistant can execute via chat messages.',
    `Goal: ${campaign.title}`,
    campaign.description ? `Resources and context: ${campaign.description}` : null,
    '',
    'Each task must be something an AI agent can actually do: draft copy, write code, summarize a document, research a topic, generate a file, review content, or produce a structured output.',
    'Do NOT include tasks that require a human to click a UI, open a native app, or make a live deployment decision.',
    'Every task description must include: (1) the specific action to take, (2) any relevant resource from the context (URL, file, repo, doc), (3) the exact output to return (e.g. "return as a markdown list", "output a React component", "write as a JSON object").',
    '',
    'Return strict JSON only. No markdown, no explanation.',
    'Schema: {"plans":[{"name":"Action Plan","tasks":[{"key":"task-1","title":"Verb + subject","description":"Full executable instruction with resources and expected output format","deps":[]}]}]}',
    'Rules: 3–8 tasks. Keys must be unique (task-1, task-2, …). deps must reference keys in this list or be empty. Return exactly ONE plan.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await dispatchToOpenClaw({
      text: prompt,
      agentId: 'emerald',
      sessionKey: `dispatch-plan:${campaignId}`,
      timeoutMs: 90_000,
    });

    const rawJson = extractJson(result.output || '');
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error(`Planner returned invalid JSON: ${result.output?.slice(0, 200)}`);
    }
    if (!parsed || !Array.isArray((parsed as RawPlanEnvelope).plans) || (parsed as RawPlanEnvelope).plans.length === 0) {
      throw new Error(`Planner did not return a usable plan. Got: ${result.output?.slice(0, 200)}`);
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

  const createdTaskIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.dispatchTask.deleteMany({ where: { campaignId } });

    for (const rawTask of selectedTasks) {
      if (!rawTask || typeof rawTask !== 'object') continue;
      const task = rawTask as Prisma.JsonObject;
      const title = typeof task.title === 'string' ? task.title.trim() : '';
      if (!title) continue;
      const created = await tx.dispatchTask.create({
        data: {
          campaignId,
          title,
          key: typeof task.key === 'string' ? task.key.trim() : null,
          description: typeof task.description === 'string' ? task.description.trim() : null,
          dependencies: asStringArray(task.dependencies),
          status: DispatchTaskStatus.PLANNED,
        },
      });
      createdTaskIds.push(created.id);
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

  // After transaction: publish each task to the GitHub task-pool
  if (createdTaskIds.length && process.env.GITHUB_TOKEN) {
    const createdTasks = await prisma.dispatchTask.findMany({
      where: { id: { in: createdTaskIds } },
      orderBy: { createdAt: 'asc' },
    });

    for (const task of createdTasks) {
      try {
        const issue = await createTaskPoolIssue({
          title: `[Dispatch] ${task.title}`,
          description: buildIssueBody(task, campaign),
          priority: dispatchPriorityToTaskPriority(task.priority),
          workflowId: 'tpw_dispatch',
        });
        if (issue) {
          const issueNumber = parseInt(issue.id.replace('tpt_', ''), 10);
          await prisma.dispatchTask.update({
            where: { id: task.id },
            data: {
              taskPoolIssueNumber: isNaN(issueNumber) ? null : issueNumber,
              taskPoolIssueUrl: issue.sourceUrl,
            },
          });
        }
      } catch {
        // Non-fatal — dispatch continues even if GitHub is unreachable
      }
    }
  }

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

// ── Task-pool helpers ─────────────────────────────────────────────────────────

function dispatchPriorityToTaskPriority(priority: number): TaskPriority {
  if (priority <= 1) return TaskPriority.CRITICAL;
  if (priority === 2) return TaskPriority.HIGH;
  if (priority >= 4) return TaskPriority.LOW;
  return TaskPriority.MEDIUM;
}

function buildIssueBody(
  task: { title: string; description?: string | null },
  campaign: { id: string; title: string; description?: string | null }
): string {
  return [
    `## Dispatch Campaign`,
    `**Campaign:** ${campaign.title}`,
    `**Campaign ID:** \`${campaign.id}\``,
    '',
    '---',
    '',
    task.description ?? task.title,
  ].join('\n');
}

// ── Bot routing ──────────────────────────────────────────────────────────────

function routeTaskToBot(task: { title: string; description?: string | null }): string {
  const haystack = `${task.title} ${task.description ?? ''}`.toLowerCase();
  if (haystack.match(/analyz|audit|verif|diagnos|investigat|pattern|architecture|dashboard|finance|financial|budget|cash.?flow|debt|invest|ledger|invoice|expense|payment|bill|liquidity|forecast|leverage|reconcil/)) return 'emerald';
  if (haystack.match(/email|reply|message|copy|comms|outreach|personal|social|relationship|schedule/)) return 'ruby';
  if (haystack.match(/doc|contract|pdf|form|extract|intake/)) return 'adobe';
  if (haystack.match(/automat|deploy|infrastructure|script|command|system|health|orchestrat|build|install|setup|run /)) return 'main';
  return 'main';
}

function buildTaskPrompt(
  task: { title: string; description?: string | null; toolRequirements?: Prisma.JsonValue | null },
  campaign: { title: string; description?: string | null }
): string {
  const requirements = Array.isArray(task.toolRequirements)
    ? (task.toolRequirements as string[]).filter((r): r is string => typeof r === 'string')
    : [];
  const tools = getToolsForRequirements(requirements);
  const toolsBlock = buildToolsBlock(tools);

  return [
    `Campaign goal: ${campaign.title}`,
    campaign.description ? `Context and resources: ${campaign.description}` : null,
    '',
    `Task: ${task.title}`,
    task.description ?? null,
    '',
    toolsBlock || null,
    'Complete this task. Return your output directly — no meta-commentary.',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export async function recommendBotForCampaign(campaignId: string) {
  const campaign = await prisma.dispatchCampaign.findUnique({
    where: { id: campaignId },
    include: { tasks: true },
  });
  if (!campaign) throw new Error('Campaign not found');

  const tally: Record<string, number> = {};
  const source = campaign.tasks.length
    ? campaign.tasks
    : [{ title: campaign.title, description: campaign.description }];

  for (const item of source) {
    const bot = routeTaskToBot(item);
    tally[bot] = (tally[bot] ?? 0) + 1;
  }

  const recommended = Object.entries(tally).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'main';

  const botNames: Record<string, string> = {
    main: 'Adrian',
    emerald: 'Emerald',
    ruby: 'Ruby',
    adobe: 'Adobe Pettaway',
  };

  return {
    recommended,
    botName: botNames[recommended] ?? recommended,
    breakdown: tally,
    taskCount: campaign.tasks.length,
  };
}

export async function replanDispatchTask(campaignId: string, taskId: string) {
  const campaign = await prisma.dispatchCampaign.findUnique({
    where: { id: campaignId },
    include: { tasks: { orderBy: { createdAt: 'asc' } } },
  });
  if (!campaign) throw new Error('Campaign not found');

  const failedTask = campaign.tasks.find((t) => t.id === taskId);
  if (!failedTask) throw new Error('Task not found in campaign');

  const doneTasks = campaign.tasks.filter((t) => t.status === DispatchTaskStatus.DONE);

  const doneContext = doneTasks.length
    ? doneTasks
        .map((t) => `- ${t.title}: ${t.output?.slice(0, 300) ?? '(no output)'}`)
        .join('\n')
    : 'None yet.';

  const prompt = [
    `You are a task planner. A campaign is in progress and one task has failed.`,
    ``,
    `Campaign goal: ${campaign.title}`,
    campaign.description ? `Context: ${campaign.description}` : null,
    ``,
    `Completed tasks so far:`,
    doneContext,
    ``,
    `Failed task: ${failedTask.title}`,
    failedTask.description ? `Description: ${failedTask.description}` : null,
    failedTask.errorMessage ? `Error: ${failedTask.errorMessage}` : null,
    ``,
    `Propose a replacement task that achieves the same sub-goal via a different, more reliable approach.`,
    `Return strict JSON only — no markdown, no explanation.`,
    `Schema: {"title":"Verb + subject","description":"Full executable instruction with expected output format"}`,
  ]
    .filter(Boolean)
    .join('\n');

  const result = await dispatchToOpenClaw({
    text: prompt,
    agentId: 'emerald',
    sessionKey: `dispatch-replan:${taskId}`,
    timeoutMs: 60_000,
  });

  const rawJson = extractJson(result.output || '');
  let parsed: { title?: string; description?: string };
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error(`Planner returned invalid JSON: ${result.output?.slice(0, 200)}`);
  }
  const newTitle = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  if (!newTitle) throw new Error('Planner did not return a usable task title');

  const newTask = await prisma.$transaction(async (tx) => {
    await tx.dispatchTask.update({
      where: { id: taskId },
      data: { status: DispatchTaskStatus.CANCELED },
    });

    return tx.dispatchTask.create({
      data: {
        campaignId,
        title: newTitle,
        description: typeof parsed.description === 'string' ? parsed.description.trim() : null,
        priority: failedTask.priority,
        dependencies: asStringArray(failedTask.dependencies),
        status: DispatchTaskStatus.PLANNED,
      },
    });
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'dispatch_task',
      entityId: taskId,
      eventType: 'task.replanned',
      metadata: { replacedBy: newTask.id, newTitle },
    },
  });

  // Publish replacement task to GitHub task-pool
  if (process.env.GITHUB_TOKEN) {
    try {
      const issue = await createTaskPoolIssue({
        title: `[Dispatch] ${newTask.title}`,
        description: buildIssueBody(newTask, campaign),
        priority: dispatchPriorityToTaskPriority(newTask.priority),
        workflowId: 'tpw_dispatch',
      });
      if (issue) {
        const issueNumber = parseInt(issue.id.replace('tpt_', ''), 10);
        await prisma.dispatchTask.update({
          where: { id: newTask.id },
          data: {
            taskPoolIssueNumber: isNaN(issueNumber) ? null : issueNumber,
            taskPoolIssueUrl: issue.sourceUrl,
          },
        });
      }
    } catch {
      // Non-fatal
    }
  }

  return newTask;
}

export async function reviewDispatchTask(taskId: string): Promise<string | null> {
  const task = await prisma.dispatchTask.findUnique({
    where: { id: taskId },
    include: { campaign: true },
  });
  if (!task) throw new Error('Task not found');
  if (!task.output) throw new Error('Task has no output to review');

  const reviewPrompt = [
    `You are reviewing work produced by another AI agent for quality and accuracy.`,
    ``,
    `Campaign: ${task.campaign.title}`,
    `Task: ${task.title}`,
    task.description ? `Task description: ${task.description}` : null,
    ``,
    `Agent output to review:`,
    `---`,
    task.output,
    `---`,
    ``,
    `Provide a concise review with:`,
    `1. Quality score (1–10)`,
    `2. What's strong about this output`,
    `3. Any gaps, errors, or improvements needed`,
    `4. Revised output if meaningful changes are warranted (otherwise say "Output is satisfactory")`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  const review = await dispatchToOpenClaw({
    text: reviewPrompt,
    agentId: 'emerald',
    sessionKey: `dispatch-review:${taskId}`,
    timeoutMs: 90_000,
  });

  await prisma.dispatchTask.update({
    where: { id: taskId },
    data: { reviewOutput: review.output },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'dispatch_task',
      entityId: taskId,
      eventType: 'task.reviewed',
      metadata: { triggered: 'manual' },
    },
  });

  return review.output;
}

export async function executeDispatchTask(taskId: string, agentIdOverride?: string) {
  const task = await prisma.dispatchTask.findUnique({
    where: { id: taskId },
    include: { campaign: true },
  });
  if (!task) throw new Error('Task not found');

  const agentId = agentIdOverride ?? routeTaskToBot(task);

  await prisma.dispatchTask.update({
    where: { id: taskId },
    data: { status: DispatchTaskStatus.RUNNING, agentId, startedAt: new Date() },
  });

  const prompt = buildTaskPrompt(task, task.campaign);

  const taskToolRequirements = Array.isArray(task.toolRequirements)
    ? (task.toolRequirements as string[]).filter((r): r is string => typeof r === 'string')
    : [];
  const resolvedTools = getToolsForRequirements(taskToolRequirements);

  try {
    const result =
      resolvedTools.length > 0
        ? await dispatchWithTools({
            text: prompt,
            agentId,
            sessionKey: `dispatch-task:${taskId}`,
            tools: resolvedTools,
            maxTurns: 6,
            timeoutMs: 180_000,
          })
        : { ...(await dispatchToOpenClaw({ text: prompt, agentId, sessionKey: `dispatch-task:${taskId}`, timeoutMs: 120_000 })), turns: 1 };

    await prisma.dispatchTask.update({
      where: { id: taskId },
      data: {
        status: DispatchTaskStatus.DONE,
        output: result.output,
        completedAt: new Date(),
        toolTurns: result.turns > 1 ? result.turns : null,
      },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'dispatch_task',
        entityId: taskId,
        eventType: 'task.done',
        metadata: { agentId: result.agentId, outputLength: result.output?.length ?? 0, toolTurns: result.turns },
      },
    });

    // Peer-review pass — Emerald checks the primary bot's work
    if (agentId !== 'emerald') {
      await reviewDispatchTask(taskId).catch(() => {
        // Non-fatal — review failure never blocks task completion
      });
    }

    // Close the linked GitHub issue and append agent output
    if (task.taskPoolIssueNumber) {
      closeTaskPoolIssueWithOutput({
        issueNumber: task.taskPoolIssueNumber,
        output: result.output ?? '',
        agentId: result.agentId,
        campaignId: task.campaignId,
      }).catch(() => {
        // Non-fatal
      });
    }

    return { taskId, status: 'DONE' as const, output: result.output };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    await prisma.dispatchTask.update({
      where: { id: taskId },
      data: { status: DispatchTaskStatus.FAILED, completedAt: new Date(), errorMessage },
    });

    await prisma.auditEvent.create({
      data: {
        entityType: 'dispatch_task',
        entityId: taskId,
        eventType: 'task.failed',
        metadata: { error: errorMessage },
      },
    });

    throw error;
  }
}

export async function retryDispatchTask(taskId: string, agentIdOverride?: string) {
  const task = await prisma.dispatchTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error('Task not found');

  await prisma.dispatchTask.update({
    where: { id: taskId },
    data: { status: DispatchTaskStatus.QUEUED, errorMessage: null, output: null, reviewOutput: null },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'dispatch_task',
      entityId: taskId,
      eventType: 'task.retry',
      metadata: { agentIdOverride: agentIdOverride ?? null },
    },
  });

  return executeDispatchTask(taskId, agentIdOverride);
}

export async function runDispatchCampaign(campaignId: string) {
  const campaign = await prisma.dispatchCampaign.findUnique({
    where: { id: campaignId },
    include: { tasks: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] } },
  });
  if (!campaign) throw new Error('Campaign not found');

  const pending = campaign.tasks.filter(
    (t) => t.status !== DispatchTaskStatus.DONE && t.status !== DispatchTaskStatus.CANCELED
  );
  if (!pending.length) throw new Error('No executable tasks on this campaign');

  await prisma.dispatchCampaign.update({
    where: { id: campaignId },
    data: { status: DispatchCampaignStatus.EXECUTING },
  });

  await prisma.dispatchTask.updateMany({
    where: { campaignId, status: { in: [DispatchTaskStatus.PLANNED] } },
    data: { status: DispatchTaskStatus.QUEUED },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'dispatch_campaign',
      entityId: campaignId,
      eventType: 'campaign.run.started',
      metadata: { taskCount: pending.length },
    },
  });

  const results: Array<{ taskId: string; status: string; error?: string }> = [];

  // Build a key → task map so dependency strings can be resolved
  const keyToTask = new Map(pending.filter((t) => t.key).map((t) => [t.key!, t]));
  // Track which keys finished successfully
  const doneKeys = new Set<string>();

  for (const task of pending) {
    const deps = Array.isArray(task.dependencies) ? (task.dependencies as string[]) : [];
    // A task is blocked if any of its dependency keys exist in the map but haven't completed
    const blockedByFailure = deps.some((dep) => keyToTask.has(dep) && !doneKeys.has(dep));

    if (blockedByFailure) {
      await prisma.dispatchTask.update({
        where: { id: task.id },
        data: { status: DispatchTaskStatus.CANCELED },
      });
      results.push({ taskId: task.id, status: 'CANCELED' });
      continue;
    }

    try {
      await executeDispatchTask(task.id);
      if (task.key) doneKeys.add(task.key);
      results.push({ taskId: task.id, status: 'DONE' });
    } catch (error) {
      results.push({ taskId: task.id, status: 'FAILED', error: String(error) });
    }
  }

  const allDone = results.every((r) => r.status === 'DONE' || r.status === 'CANCELED');
  const anyFailed = results.some((r) => r.status === 'FAILED');
  const finalStatus = allDone
    ? DispatchCampaignStatus.COMPLETED
    : anyFailed
    ? DispatchCampaignStatus.PAUSED
    : DispatchCampaignStatus.EXECUTING;

  await prisma.dispatchCampaign.update({
    where: { id: campaignId },
    data: { status: finalStatus },
  });

  const doneCnt = results.filter((r) => r.status === 'DONE').length;
  const failedCnt = results.filter((r) => r.status === 'FAILED').length;
  const canceledCnt = results.filter((r) => r.status === 'CANCELED').length;

  await prisma.auditEvent.create({
    data: {
      entityType: 'dispatch_campaign',
      entityId: campaignId,
      eventType: 'campaign.run.completed',
      metadata: { finalStatus, done: doneCnt, failed: failedCnt, canceled: canceledCnt },
    },
  });

  // Fire campaign-completion webhook (non-fatal)
  if (campaign.callbackUrl) {
    try {
      const payload = JSON.stringify({
        campaignId,
        finalStatus,
        done: doneCnt,
        failed: failedCnt,
        canceled: canceledCnt,
        timestamp: new Date().toISOString(),
      });
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (campaign.callbackSecret) {
        const sig = createHmac('sha256', campaign.callbackSecret).update(payload).digest('hex');
        headers['x-dispatch-signature'] = `sha256=${sig}`;
      }
      await fetch(campaign.callbackUrl, { method: 'POST', headers, body: payload });
    } catch {
      // Non-fatal — webhook failure never blocks campaign
    }
  }

  return { campaignId, finalStatus, results };
}

export async function enqueueDispatchCampaign(campaignId: string) {
  const campaign = await prisma.dispatchCampaign.update({
    where: { id: campaignId },
    data: { status: DispatchCampaignStatus.QUEUED, queuedAt: new Date() },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'dispatch_campaign',
      entityId: campaignId,
      eventType: 'campaign.queued',
    },
  });

  return campaign;
}

export async function scheduleDispatchCampaign(campaignId: string, scheduledAt: Date) {
  const campaign = await prisma.dispatchCampaign.update({
    where: { id: campaignId },
    data: { status: DispatchCampaignStatus.SCHEDULED, scheduledAt },
  });

  await prisma.auditEvent.create({
    data: {
      entityType: 'dispatch_campaign',
      entityId: campaignId,
      eventType: 'campaign.scheduled',
      metadata: { scheduledAt: scheduledAt.toISOString() },
    },
  });

  return campaign;
}

// ── Queue / scheduler worker ─────────────────────────────────────────────────

export async function processDispatchQueue(): Promise<{ processed: number; skipped: number }> {
  const now = new Date();

  const [queued, scheduled] = await Promise.all([
    prisma.dispatchCampaign.findMany({
      where: { status: DispatchCampaignStatus.QUEUED },
      orderBy: { queuedAt: 'asc' },
    }),
    prisma.dispatchCampaign.findMany({
      where: { status: DispatchCampaignStatus.SCHEDULED, scheduledAt: { lte: now } },
      orderBy: { scheduledAt: 'asc' },
    }),
  ]);

  const candidates = [...queued, ...scheduled];
  let processed = 0;
  let skipped = 0;

  for (const campaign of candidates) {
    try {
      await runDispatchCampaign(campaign.id);
      processed++;
    } catch (err) {
      console.error(`[dispatch:worker] Campaign ${campaign.id} failed:`, err);
      skipped++;
    }
  }

  return { processed, skipped };
}

// ── Progress ─────────────────────────────────────────────────────────────────

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
