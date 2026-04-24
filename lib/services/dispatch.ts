import { createHmac, randomUUID } from 'node:crypto';
import { asc, and, desc, eq, inArray, lte } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditEvents, dispatchCampaigns, dispatchTasks } from '@/lib/db/schema';
import { DispatchCampaignStatus, DispatchTaskStatus, TaskPriority } from '@/lib/db/prisma-types';
import type { JsonArray, JsonObject, JsonValue } from '@/lib/db/json';
import { dispatchToOpenClaw, dispatchWithTools } from '@/lib/services/openclaw';
import { closeTaskPoolIssueWithOutput, createTaskPoolIssue } from '@/lib/integrations/task-pool';
import { buildToolsBlock, getToolsForRequirements } from '@/lib/tools/registry';
import { writeCampaignOutput, pingTelegramCampaignComplete } from '@/lib/services/campaign-output';

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

function asStringArray(value: unknown) {
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
  const campaigns = await db.select().from(dispatchCampaigns).orderBy(desc(dispatchCampaigns.createdAt));
  const campaignIds = campaigns.map((c) => c.id);
  const taskRows = campaignIds.length
    ? await db
        .select()
        .from(dispatchTasks)
        .where(inArray(dispatchTasks.campaignId, campaignIds))
        .orderBy(asc(dispatchTasks.createdAt))
    : [];

  return campaigns.map((campaign) => ({
    ...campaign,
    tasks: taskRows.filter((t) => t.campaignId === campaign.id),
  }));
}

export async function getDispatchCampaign(id: string) {
  const [campaign] = await db.select().from(dispatchCampaigns).where(eq(dispatchCampaigns.id, id)).limit(1);
  if (!campaign) return null;
  const taskRows = await db
    .select()
    .from(dispatchTasks)
    .where(eq(dispatchTasks.campaignId, campaign.id))
    .orderBy(asc(dispatchTasks.createdAt));
  return { ...campaign, tasks: taskRows };
}

export async function createDispatchCampaign(input: {
  title: string;
  description?: string;
  costBudgetCents?: number;
  timeBudgetSeconds?: number;
  callbackUrl?: string;
  callbackSecret?: string;
  projectId?: string;
  visionItemId?: string;
  outputFolder?: string;
  assignedBotId?: string;
  revenueStream?: string;
  linkedTaskRef?: string;
}) {
  const now = new Date();
  const [campaign] = await db
    .insert(dispatchCampaigns)
    .values({
      id: randomUUID(),
      title: input.title.trim(),
      description: input.description?.trim() || null,
      costBudgetCents: input.costBudgetCents ?? null,
      timeBudgetSeconds: input.timeBudgetSeconds ?? null,
      callbackUrl: input.callbackUrl?.trim() || null,
      callbackSecret: input.callbackSecret?.trim() || null,
      projectId: input.projectId?.trim() || null,
      visionItemId: input.visionItemId?.trim() || null,
      outputFolder: input.outputFolder?.trim() || null,
      assignedBotId: input.assignedBotId?.trim() || null,
      revenueStream: input.revenueStream?.trim() || null,
      linkedTaskRef: input.linkedTaskRef?.trim() || null,
      updatedAt: now,
    })
    .returning();

  await db.insert(auditEvents).values({
    id: randomUUID(),
    entityType: 'dispatch_campaign',
    entityId: campaign.id,
    eventType: 'created',
    metadata: { title: campaign.title },
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
  const now = new Date();
  const [task] = await db
    .insert(dispatchTasks)
    .values({
      id: randomUUID(),
      campaignId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: input.priority ?? 5,
      dependencies: input.dependencies?.length ? input.dependencies : [],
      toolRequirements: input.toolRequirements?.length ? input.toolRequirements : [],
      updatedAt: now,
    })
    .returning();

  await db.insert(auditEvents).values({
    id: randomUUID(),
    entityType: 'dispatch_task',
    entityId: task.id,
    eventType: 'created',
    metadata: { campaignId, title: task.title },
  });

  return task;
}

export async function generateDispatchPlans(campaignId: string) {
  const [campaign] = await db.select().from(dispatchCampaigns).where(eq(dispatchCampaigns.id, campaignId)).limit(1);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  await db
    .update(dispatchCampaigns)
    .set({ status: DispatchCampaignStatus.PLANNING, updatedAt: new Date() })
    .where(eq(dispatchCampaigns.id, campaignId));

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
      agentId: 'adrian',
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

    const [updatedCampaign] = await db
      .update(dispatchCampaigns)
      .set({
        status: DispatchCampaignStatus.READY,
        latestPlan,
        latestPlanCreatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dispatchCampaigns.id, campaignId))
      .returning();

    await db.insert(auditEvents).values({
      id: randomUUID(),
      entityType: 'dispatch_campaign',
      entityId: campaignId,
      eventType: 'plan.generated',
      metadata: { planCount: latestPlan.plans.length, agentId: result.agentId },
    });

    return {
      campaign: updatedCampaign,
      plans: latestPlan.plans,
    };
  } catch (error) {
    await db
      .update(dispatchCampaigns)
      .set({ status: campaign.status, updatedAt: new Date() })
      .where(eq(dispatchCampaigns.id, campaignId));
    throw error;
  }
}

export async function approveDispatchPlan(campaignId: string, planName?: string) {
  const campaign = await getDispatchCampaign(campaignId);

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  const latestPlan = campaign.latestPlan as JsonObject | null;
  const plans = Array.isArray(latestPlan?.plans) ? (latestPlan?.plans as JsonArray) : [];
  const selected = plans.find((plan) => {
    if (!plan || typeof plan !== 'object') return false;
    const name = (plan as JsonObject).name;
    return planName ? name === planName : true;
  }) as JsonObject | undefined;

  if (!selected) {
    throw new Error('No matching plan available');
  }

  const selectedPlanName = typeof selected.name === 'string' ? selected.name : 'Plan A';
  const selectedTasks = Array.isArray(selected.tasks) ? (selected.tasks as JsonArray) : [];

  const createdTaskIds: string[] = [];

  await db.transaction(async (tx) => {
    await tx.delete(dispatchTasks).where(eq(dispatchTasks.campaignId, campaignId));

    for (const rawTask of selectedTasks) {
      if (!rawTask || typeof rawTask !== 'object') continue;
      const task = rawTask as JsonObject;
      const title = typeof task.title === 'string' ? task.title.trim() : '';
      if (!title) continue;
      const [created] = await tx
        .insert(dispatchTasks)
        .values({
          id: randomUUID(),
          campaignId,
          title,
          key: typeof task.key === 'string' ? task.key.trim() : null,
          description: typeof task.description === 'string' ? task.description.trim() : null,
          dependencies: asStringArray(task.dependencies),
          status: DispatchTaskStatus.PLANNED,
          updatedAt: new Date(),
        })
        .returning({ id: dispatchTasks.id });
      createdTaskIds.push(created.id);
    }

    await tx
      .update(dispatchCampaigns)
      .set({
        status: DispatchCampaignStatus.EXECUTING,
        approvedPlanName: selectedPlanName,
        approvedPlanAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dispatchCampaigns.id, campaignId));

    await tx.insert(auditEvents).values({
      id: randomUUID(),
      entityType: 'dispatch_campaign',
      entityId: campaignId,
      eventType: 'plan.approved',
      metadata: {
        planName: selectedPlanName,
        taskCount: selectedTasks.length,
      },
    });
  });

  // After transaction: publish each task to the GitHub task-pool
  if (createdTaskIds.length) {
    if (!process.env.GITHUB_TOKEN) {
      console.warn(
        JSON.stringify({
          service: 'dispatch',
          event: 'github_issue_creation_skipped',
          reason: 'GITHUB_TOKEN not configured',
          taskCount: createdTaskIds.length,
          timestamp: new Date().toISOString(),
        })
      );
    } else {
      const createdTasks = await db
        .select()
        .from(dispatchTasks)
        .where(inArray(dispatchTasks.id, createdTaskIds))
        .orderBy(asc(dispatchTasks.createdAt));

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
            await db
              .update(dispatchTasks)
              .set({
                taskPoolIssueNumber: isNaN(issueNumber) ? null : issueNumber,
                taskPoolIssueUrl: issue.sourceUrl,
                updatedAt: new Date(),
              })
              .where(eq(dispatchTasks.id, task.id));
          }
        } catch {
          // Non-fatal — dispatch continues even if GitHub is unreachable
        }
      }
    }
  }

  return getDispatchCampaign(campaignId);
}

export async function setDispatchCampaignStatus(campaignId: string, status: DispatchCampaignStatus) {
  const [campaign] = await db
    .update(dispatchCampaigns)
    .set({ status, updatedAt: new Date() })
    .where(eq(dispatchCampaigns.id, campaignId))
    .returning();

  await db.insert(auditEvents).values({
    id: randomUUID(),
    entityType: 'dispatch_campaign',
    entityId: campaignId,
    eventType: `status.${status.toLowerCase()}`,
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
  if (haystack.match(/code|debug|bug|fix|refactor|implement|terminal|cli|shell|script|build|deploy|compile|test suite|stack trace|repo|pull request|pr /)) return 'iceman';
  if (haystack.match(/analyz|audit|verif|diagnos|investigat|pattern|architecture|dashboard|finance|financial|budget|cash.?flow|debt|invest|ledger|invoice|expense|payment|bill|liquidity|forecast|leverage|reconcil/)) return 'emerald';
  if (haystack.match(/email|reply|message|copy|comms|outreach|personal|social|relationship|schedule/)) return 'ruby';
  if (haystack.match(/doc|contract|pdf|form|extract|intake/)) return 'adobe';
  if (haystack.match(/prioriti|sequence|coordina|follow.?through|re.?entry|ownership|accountabil|stall|friction|handoff|unblock people/)) return 'anchor';
  if (haystack.match(/automat|deploy|infrastructure|script|command|system|health|orchestrat|build|install|setup|run /)) return 'main';
  return 'main';
}

function buildTaskPrompt(
  task: { title: string; description?: string | null; toolRequirements?: unknown },
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
  const campaign = await getDispatchCampaign(campaignId);
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
    iceman: 'Iceman',
    emerald: 'Emerald',
    ruby: 'Ruby',
    adobe: 'Adobe Pettaway',
    anchor: 'Anchor',
  };

  return {
    recommended,
    botName: botNames[recommended] ?? recommended,
    breakdown: tally,
    taskCount: campaign.tasks.length,
  };
}

export async function replanDispatchTask(campaignId: string, taskId: string) {
  const campaign = await getDispatchCampaign(campaignId);
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
    agentId: 'adrian',
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

  const newTask = await db.transaction(async (tx) => {
    await tx
      .update(dispatchTasks)
      .set({ status: DispatchTaskStatus.CANCELED, updatedAt: new Date() })
      .where(eq(dispatchTasks.id, taskId));

    const [created] = await tx
      .insert(dispatchTasks)
      .values({
        id: randomUUID(),
        campaignId,
        title: newTitle,
        description: typeof parsed.description === 'string' ? parsed.description.trim() : null,
        priority: failedTask.priority,
        dependencies: asStringArray(failedTask.dependencies),
        status: DispatchTaskStatus.PLANNED,
        updatedAt: new Date(),
      })
      .returning();

    await tx.insert(auditEvents).values({
      id: randomUUID(),
      entityType: 'dispatch_task',
      entityId: taskId,
      eventType: 'task.replanned',
      metadata: { replacedBy: created.id, newTitle },
    });

    return created;
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
        await db
          .update(dispatchTasks)
          .set({
            taskPoolIssueNumber: isNaN(issueNumber) ? null : issueNumber,
            taskPoolIssueUrl: issue.sourceUrl,
            updatedAt: new Date(),
          })
          .where(eq(dispatchTasks.id, newTask.id));
      }
    } catch {
      // Non-fatal
    }
  }

  return newTask;
}

export async function reviewDispatchTask(taskId: string): Promise<string | null> {
  const [row] = await db
    .select({ task: dispatchTasks, campaign: dispatchCampaigns })
    .from(dispatchTasks)
    .leftJoin(dispatchCampaigns, eq(dispatchTasks.campaignId, dispatchCampaigns.id))
    .where(eq(dispatchTasks.id, taskId))
    .limit(1);

  const task = row?.task;
  const campaign = row?.campaign;
  if (!task || !campaign) throw new Error('Task not found');
  if (!task.output) throw new Error('Task has no output to review');

  const reviewPrompt = [
    `You are reviewing work produced by another AI agent for quality and accuracy.`,
    ``,
    `Campaign: ${campaign.title}`,
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
    agentId: 'adrian',
    timeoutMs: 90_000,
  });

  await db
    .update(dispatchTasks)
    .set({ reviewOutput: review.output, updatedAt: new Date() })
    .where(eq(dispatchTasks.id, taskId));

  await db.insert(auditEvents).values({
    id: randomUUID(),
    entityType: 'dispatch_task',
    entityId: taskId,
    eventType: 'task.reviewed',
    metadata: { triggered: 'manual' },
  });

  return review.output;
}

export async function executeDispatchTask(taskId: string, agentIdOverride?: string) {
  const [row] = await db
    .select({ task: dispatchTasks, campaign: dispatchCampaigns })
    .from(dispatchTasks)
    .leftJoin(dispatchCampaigns, eq(dispatchTasks.campaignId, dispatchCampaigns.id))
    .where(eq(dispatchTasks.id, taskId))
    .limit(1);

  const task = row?.task;
  const campaign = row?.campaign;
  if (!task || !campaign) throw new Error('Task not found');

  const agentId = agentIdOverride ?? routeTaskToBot(task);

  await db
    .update(dispatchTasks)
    .set({ status: DispatchTaskStatus.RUNNING, agentId, startedAt: new Date(), updatedAt: new Date() })
    .where(eq(dispatchTasks.id, taskId));

  const prompt = buildTaskPrompt(task, campaign);

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

    await db
      .update(dispatchTasks)
      .set({
        status: DispatchTaskStatus.DONE,
        output: result.output,
        completedAt: new Date(),
        toolTurns: result.turns > 1 ? result.turns : null,
        updatedAt: new Date(),
      })
      .where(eq(dispatchTasks.id, taskId));

    await db.insert(auditEvents).values({
      id: randomUUID(),
      entityType: 'dispatch_task',
      entityId: taskId,
      eventType: 'task.done',
      metadata: { agentId: result.agentId, outputLength: result.output?.length ?? 0, toolTurns: result.turns },
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

    await db
      .update(dispatchTasks)
      .set({ status: DispatchTaskStatus.FAILED, completedAt: new Date(), errorMessage, updatedAt: new Date() })
      .where(eq(dispatchTasks.id, taskId));

    await db.insert(auditEvents).values({
      id: randomUUID(),
      entityType: 'dispatch_task',
      entityId: taskId,
      eventType: 'task.failed',
      metadata: { error: errorMessage },
    });

    throw error;
  }
}

export async function retryDispatchTask(taskId: string, agentIdOverride?: string) {
  const [task] = await db.select().from(dispatchTasks).where(eq(dispatchTasks.id, taskId)).limit(1);
  if (!task) throw new Error('Task not found');

  await db
    .update(dispatchTasks)
    .set({
      status: DispatchTaskStatus.QUEUED,
      errorMessage: null,
      output: null,
      reviewOutput: null,
      updatedAt: new Date(),
    })
    .where(eq(dispatchTasks.id, taskId));

  await db.insert(auditEvents).values({
    id: randomUUID(),
    entityType: 'dispatch_task',
    entityId: taskId,
    eventType: 'task.retry',
    metadata: { agentIdOverride: agentIdOverride ?? null },
  });

  return executeDispatchTask(taskId, agentIdOverride);
}

export async function runDispatchCampaign(campaignId: string) {
  const [campaign] = await db.select().from(dispatchCampaigns).where(eq(dispatchCampaigns.id, campaignId)).limit(1);
  if (!campaign) throw new Error('Campaign not found');

  const campaignTasks = await db
    .select()
    .from(dispatchTasks)
    .where(eq(dispatchTasks.campaignId, campaignId))
    .orderBy(asc(dispatchTasks.priority), asc(dispatchTasks.createdAt));

  const campaignWithTasks = { ...campaign, tasks: campaignTasks };

  const pending = campaignWithTasks.tasks.filter(
    (t) => t.status !== DispatchTaskStatus.DONE && t.status !== DispatchTaskStatus.CANCELED
  );
  if (!pending.length) throw new Error('No executable tasks on this campaign');

  await db
    .update(dispatchCampaigns)
    .set({ status: DispatchCampaignStatus.EXECUTING, updatedAt: new Date() })
    .where(eq(dispatchCampaigns.id, campaignId));

  await db
    .update(dispatchTasks)
    .set({ status: DispatchTaskStatus.QUEUED, updatedAt: new Date() })
    .where(and(eq(dispatchTasks.campaignId, campaignId), eq(dispatchTasks.status, DispatchTaskStatus.PLANNED)));

  await db.insert(auditEvents).values({
    id: randomUUID(),
    entityType: 'dispatch_campaign',
    entityId: campaignId,
    eventType: 'campaign.run.started',
    metadata: { taskCount: pending.length },
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
      await db
        .update(dispatchTasks)
        .set({ status: DispatchTaskStatus.CANCELED, updatedAt: new Date() })
        .where(eq(dispatchTasks.id, task.id));
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

  await db
    .update(dispatchCampaigns)
    .set({ status: finalStatus, updatedAt: new Date() })
    .where(eq(dispatchCampaigns.id, campaignId));

  const doneCnt = results.filter((r) => r.status === 'DONE').length;
  const failedCnt = results.filter((r) => r.status === 'FAILED').length;
  const canceledCnt = results.filter((r) => r.status === 'CANCELED').length;

  await db.insert(auditEvents).values({
    id: randomUUID(),
    entityType: 'dispatch_campaign',
    entityId: campaignId,
    eventType: 'campaign.run.completed',
    metadata: { finalStatus, done: doneCnt, failed: failedCnt, canceled: canceledCnt },
  });

  // Write output files and Telegram ping on completion (non-fatal)
  if (finalStatus === DispatchCampaignStatus.COMPLETED) {
    writeCampaignOutput(campaignId).catch(() => { /* non-fatal */ });
    pingTelegramCampaignComplete({
      id: campaignId,
      title: campaignWithTasks.title,
      status: finalStatus,
      tasks: results.map((r) => ({ status: r.status })),
    }).catch(() => { /* non-fatal */ });
  }

  // Fire campaign-completion webhook (non-fatal)
  if (campaignWithTasks.callbackUrl) {
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
      if (campaignWithTasks.callbackSecret) {
        const sig = createHmac('sha256', campaignWithTasks.callbackSecret).update(payload).digest('hex');
        headers['x-dispatch-signature'] = `sha256=${sig}`;
      }
      await fetch(campaignWithTasks.callbackUrl, { method: 'POST', headers, body: payload });
    } catch {
      // Non-fatal — webhook failure never blocks campaign
    }
  }

  return { campaignId, finalStatus, results };
}

export async function enqueueDispatchCampaign(campaignId: string) {
  const [campaign] = await db
    .update(dispatchCampaigns)
    .set({ status: DispatchCampaignStatus.QUEUED, queuedAt: new Date(), updatedAt: new Date() })
    .where(eq(dispatchCampaigns.id, campaignId))
    .returning();

  await db.insert(auditEvents).values({
    id: randomUUID(),
    entityType: 'dispatch_campaign',
    entityId: campaignId,
    eventType: 'campaign.queued',
  });

  return campaign;
}

export async function scheduleDispatchCampaign(campaignId: string, scheduledAt: Date) {
  const [campaign] = await db
    .update(dispatchCampaigns)
    .set({ status: DispatchCampaignStatus.SCHEDULED, scheduledAt, updatedAt: new Date() })
    .where(eq(dispatchCampaigns.id, campaignId))
    .returning();

  await db.insert(auditEvents).values({
    id: randomUUID(),
    entityType: 'dispatch_campaign',
    entityId: campaignId,
    eventType: 'campaign.scheduled',
    metadata: { scheduledAt: scheduledAt.toISOString() },
  });

  return campaign;
}

// ── Queue / scheduler worker ─────────────────────────────────────────────────

export async function processDispatchQueue(): Promise<{ processed: number; skipped: number }> {
  const now = new Date();

  const [queued, scheduled] = await Promise.all([
    db
      .select()
      .from(dispatchCampaigns)
      .where(eq(dispatchCampaigns.status, DispatchCampaignStatus.QUEUED))
      .orderBy(asc(dispatchCampaigns.queuedAt)),
    db
      .select()
      .from(dispatchCampaigns)
      .where(and(eq(dispatchCampaigns.status, DispatchCampaignStatus.SCHEDULED), lte(dispatchCampaigns.scheduledAt, now)))
      .orderBy(asc(dispatchCampaigns.scheduledAt)),
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
  const tasks = await db
    .select()
    .from(dispatchTasks)
    .where(eq(dispatchTasks.campaignId, campaignId))
    .orderBy(asc(dispatchTasks.createdAt));

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
