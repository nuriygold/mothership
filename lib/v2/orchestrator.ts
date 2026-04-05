import crypto from 'node:crypto';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { listTasks, updateTask } from '@/lib/services/tasks';
import { getEmailSummary } from '@/lib/services/email';
import { listAuditEvents } from '@/lib/services/audit';
import { dispatchToOpenClaw } from '@/lib/services/openclaw';
import { publishV2Event } from '@/lib/v2/event-bus';
import type {
  BotRouteKey,
  SystemHealthSnapshot,
  V2ActivityFeed,
  V2BotProfile,
  V2BotsFeed,
  V2DashboardPriorityItem,
  V2EmailDraft,
  V2EmailDraftFeed,
  V2EmailFeed,
  V2EmailItem,
  V2FinanceOverviewFeed,
  V2PendingApprovalSummary,
  V2TaskItem,
  V2TasksFeed,
  V2TodayFeed,
} from '@/lib/v2/types';

type PredictiveActionState = {
  id: string;
  dedupeKey: string;
  title: string;
  source: string;
  bot: string;
  category: 'email' | 'finance' | 'tasks' | 'other';
  approvedAt?: string;
};

const actionStore = new Map<string, PredictiveActionState>();
const dedupeStore = new Map<string, string>();
const pendingRubyDrafts = new Set<string>();
const rubyDraftStore = new Map<string, V2EmailDraft>();

const BOT_PROFILES: Array<{
  key: BotRouteKey;
  name: string;
  role: string;
  workingStyle: string;
  personality: string;
  strengths: string[];
}> = [
  {
    key: 'adrian',
    name: 'Adrian',
    role: 'Financial Operations',
    workingStyle: 'Methodical and reconciliation-first',
    personality: 'Calm, detail-first operator',
    strengths: ['Financial analysis', 'Data reconciliation', 'Exception flagging'],
  },
  {
    key: 'ruby',
    name: 'Ruby',
    role: 'Comms & Writing',
    workingStyle: 'Fast iteration with tone-aware variants',
    personality: 'Warm, direct, and pragmatic',
    strengths: ['Email drafting', 'Message sequencing', 'Narrative clarity'],
  },
  {
    key: 'emerald',
    name: 'Emerald',
    role: 'Research & Synthesis',
    workingStyle: 'Evidence-first synthesis',
    personality: 'Curious and structured',
    strengths: ['Research synthesis', 'Briefing', 'Comparative analysis'],
  },
  {
    key: 'adobe',
    name: 'Adobe Pettaway',
    role: 'Document Intelligence',
    workingStyle: 'Extraction and schema validation',
    personality: 'Precise and literal',
    strengths: ['Document parsing', 'Entity extraction', 'Validation checks'],
  },
];

function routeForTask(task: any): BotRouteKey {
  const title = String(task.title ?? '').toLowerCase();
  const description = String(task.description ?? '').toLowerCase();
  const haystack = `${title} ${description}`;
  if (haystack.match(/invoice|finance|budget|bill|expense|payment|ledger/)) return 'adrian';
  if (haystack.match(/email|reply|message|copy|comms|outreach/)) return 'ruby';
  if (haystack.match(/research|analysis|investigate|synthesis/)) return 'emerald';
  if (haystack.match(/doc|contract|pdf|form|extract|intake/)) return 'adobe';
  return 'gateway';
}

function botNameForRoute(route: BotRouteKey) {
  const profile = BOT_PROFILES.find((bot) => bot.key === route);
  return profile?.name ?? 'Gateway';
}

function mapTaskStatus(status: TaskStatus): V2TaskItem['status'] {
  if (status === TaskStatus.IN_PROGRESS) return 'Active';
  if (status === TaskStatus.BLOCKED) return 'Blocked';
  if (status === TaskStatus.DONE) return 'Done';
  return 'Queued';
}

function mapTaskPriority(priority: TaskPriority): V2TaskItem['metadata']['priority'] {
  if (priority === TaskPriority.CRITICAL) return 'critical';
  if (priority === TaskPriority.HIGH) return 'high';
  if (priority === TaskPriority.LOW) return 'low';
  return 'medium';
}

function categoryFromRoute(route: BotRouteKey): PredictiveActionState['category'] {
  if (route === 'adrian') return 'finance';
  if (route === 'ruby') return 'email';
  if (route === 'gateway') return 'tasks';
  return 'other';
}

function relativeTime(input: Date) {
  const diffMs = Date.now() - input.getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return `${hours} hr ago`;
}

function deterministicTemplateDrafts(emailId: string, subject: string): V2EmailDraft[] {
  const lowered = subject.toLowerCase();
  const isMeeting = lowered.includes('meeting') || lowered.includes('schedule');
  const isPayment = lowered.includes('invoice') || lowered.includes('payment');

  return [
    {
      id: `${emailId}-enthusiastic`,
      tone: 'Enthusiastic',
      body: isMeeting
        ? 'Absolutely—happy to meet. I can do Tuesday afternoon or Wednesday morning. Share what works best and I will lock it in.'
        : isPayment
          ? 'Thanks for sending this over. We are reviewing now and will confirm payment timing shortly.'
          : 'Love this direction. I can move this forward today and circle back with next steps.',
      approveWebhook: `/api/v2/email/send/${emailId}/enthusiastic`,
      source: 'template',
    },
    {
      id: `${emailId}-measured`,
      tone: 'Measured',
      body: isMeeting
        ? 'Thank you for the note. I can accommodate a meeting this week; please share two preferred slots and agenda context.'
        : isPayment
          ? 'Received. We are validating details and will respond with confirmation once review is complete.'
          : 'Thank you. I reviewed this and can provide a structured response once we confirm a few details.',
      approveWebhook: `/api/v2/email/send/${emailId}/measured`,
      source: 'template',
    },
  ];
}

async function generateRubyDraft(emailId: string, subject: string, preview: string) {
  if (pendingRubyDrafts.has(emailId)) return;
  pendingRubyDrafts.add(emailId);

  try {
    const result = await dispatchToOpenClaw({
      agentId: 'ruby',
      text: `Draft a concise decline-or-defer email reply with empathy. Subject: ${subject}. Context: ${preview}.`,
      sessionKey: `email-${emailId}`,
    });

    const body = result.output || 'Thank you for the note. I cannot commit to this as proposed today, but I can revisit with alternatives shortly.';
    const rubyDraft: V2EmailDraft = {
      id: `${emailId}-ruby-custom`,
      tone: 'Ruby Custom',
      body,
      approveWebhook: `/api/v2/email/send/${emailId}/ruby-custom`,
      source: 'ruby_custom',
    };
    rubyDraftStore.set(emailId, rubyDraft);
    publishV2Event(`email-drafts:${emailId}`, 'draft.generated', {
      emailId,
      draft: rubyDraft,
    });
  } catch (error) {
    publishV2Event(`email-drafts:${emailId}`, 'draft.error', {
      emailId,
      message: error instanceof Error ? error.message : 'Ruby draft failed',
    });
  } finally {
    pendingRubyDrafts.delete(emailId);
  }
}

function upsertAction(action: Omit<PredictiveActionState, 'id'>) {
  const existing = dedupeStore.get(action.dedupeKey);
  if (existing) return actionStore.get(existing)!;
  const item: PredictiveActionState = {
    id: `act_${crypto.randomUUID()}`,
    ...action,
  };
  actionStore.set(item.id, item);
  dedupeStore.set(item.dedupeKey, item.id);
  return item;
}

export async function getV2TasksFeed(): Promise<V2TasksFeed> {
  const tasks = (await listTasks()) as any[];
  const mapped: V2TaskItem[] = tasks.map((task) => {
    const route = routeForTask(task);
    const source =
      typeof task.sourceChannel === 'string' && task.sourceChannel.includes('task_pool')
        ? 'GitHub'
        : 'Internal';
    return {
      taskId: String(task.id),
      status: mapTaskStatus(task.status as TaskStatus),
      title: task.title,
      metadata: {
        timeframe: task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'Today',
        department: task.workflow?.name || 'Operations',
        assignedBot: botNameForRoute(route),
        priority: mapTaskPriority((task.priority as TaskPriority) || TaskPriority.MEDIUM),
        source,
      },
      actions: [
        { label: 'Start', endpoint: `/api/v2/tasks/${task.id}`, method: 'PATCH' },
        { label: 'Defer', endpoint: `/api/v2/tasks/${task.id}`, method: 'PATCH' },
      ],
    };
  });

  return {
    counters: {
      tracked: mapped.length,
      active: mapped.filter((task) => task.status === 'Active').length,
      blocked: mapped.filter((task) => task.status === 'Blocked').length,
      queued: mapped.filter((task) => task.status === 'Queued').length,
    },
    active: mapped.filter((task) => task.status === 'Active'),
    today: mapped.filter((task) => task.status === 'Queued' || task.status === 'Blocked'),
    backlog: mapped.filter((task) => task.status === 'Done'),
  };
}

export async function getV2BotsFeed(): Promise<V2BotsFeed> {
  const tasks = (await listTasks()) as any[];
  const grouped = new Map<BotRouteKey, any[]>();
  for (const bot of BOT_PROFILES.map((item) => item.key).concat('gateway')) {
    grouped.set(bot as BotRouteKey, []);
  }
  for (const task of tasks) {
    const route = routeForTask(task);
    grouped.get(route)?.push(task);
  }

  const bots: V2BotProfile[] = BOT_PROFILES.map((profile) => {
    const assigned = grouped.get(profile.key) ?? [];
    const current = assigned.find((task) => task.status === TaskStatus.IN_PROGRESS) ?? assigned[0];
    const recentOutputs = assigned
      .filter((task) => task.status === TaskStatus.DONE)
      .slice(0, 5)
      .map((task) => ({
        title: `${task.title} completed`,
        timestamp: relativeTime(new Date(task.updatedAt ?? Date.now())),
        type: profile.key === 'adrian' ? 'finance' : profile.key,
      }));

    return {
      identity: { name: profile.name, role: profile.role },
      liveState: {
        currentTask: current?.title ?? 'Awaiting assignment',
        status: current ? (current.status === TaskStatus.BLOCKED ? 'blocked' : 'working') : 'idle',
      },
      throughputMetrics: {
        completed: assigned.filter((task) => task.status === TaskStatus.DONE).length,
        queued: assigned.filter((task) => task.status === TaskStatus.TODO).length,
        blocked: assigned.filter((task) => task.status === TaskStatus.BLOCKED).length,
      },
      recentOutputs,
      staticProfile: {
        workingStyle: profile.workingStyle,
        personality: profile.personality,
        strengths: profile.strengths,
      },
    };
  });

  return { bots };
}

export async function getV2EmailFeed(): Promise<V2EmailFeed> {
  const summary = await getEmailSummary();
  const inbox: V2EmailItem[] = summary.previews.map((preview) => ({
    id: preview.id,
    sender: preview.from,
    subject: preview.subject,
    preview: preview.subject,
    timestamp: preview.date,
    isRead: false,
    sourceIntegration: summary.provider === 'zoho' ? 'Zoho' : summary.provider === 'gmail' ? 'Gmail' : 'Internal',
  }));
  return { inbox };
}

export async function getV2EmailDrafts(emailId: string): Promise<V2EmailDraftFeed> {
  const inbox = await getV2EmailFeed();
  const selected = inbox.inbox.find((item) => item.id === emailId);
  const fallbackSubject = selected?.subject ?? 'New request';
  const fallbackPreview = selected?.preview ?? 'Please draft a response.';

  const drafts = deterministicTemplateDrafts(emailId, fallbackSubject);
  const rubyDraft = rubyDraftStore.get(emailId);
  if (rubyDraft) drafts.push(rubyDraft);
  void generateRubyDraft(emailId, fallbackSubject, fallbackPreview);

  return {
    emailId,
    drafts,
    streamId: `email-drafts:${emailId}`,
  };
}

export async function getV2FinanceOverview(): Promise<V2FinanceOverviewFeed> {
  try {
    const tasks = (await listTasks()) as any[];
    const financeTasks = tasks.filter((task) => routeForTask(task) === 'adrian').slice(0, 10);
    const payables = financeTasks.map((task) => ({
      vendor: task.title.split('—')[0]?.trim() || 'Unspecified vendor',
      amount: Number(task.description?.match(/\$([0-9,.]+)/)?.[1]?.replace(/,/g, '') || 0),
      dueDate: task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      status: (task.status === TaskStatus.DONE
        ? 'paid'
        : task.status === TaskStatus.BLOCKED
          ? 'overdue'
          : 'pending') as 'pending' | 'paid' | 'overdue',
    }));

    return {
      accounts: [
        { type: 'Operating', balance: 145000, trendPercentage: '+2.4%' },
        { type: 'Payroll', balance: 42000, trendPercentage: '+0.6%' },
      ],
      payables,
      transactions: financeTasks.slice(0, 8).map((task) => ({
        date: new Date(task.updatedAt ?? Date.now()).toISOString(),
        description: task.title,
        category: 'Operations',
        amount: Number(task.description?.match(/\$([0-9,.]+)/)?.[1]?.replace(/,/g, '') || 0),
        handledByBot: 'Adrian',
      })),
    };
  } catch (error) {
    console.error(JSON.stringify({
      service: 'finance_adapter',
      event: 'adapter_failure',
      message: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
    return {
      accounts: [],
      payables: [],
      transactions: [],
    };
  }
}

export async function getV2Activity(page = 1, pageSize = 25): Promise<V2ActivityFeed> {
  const events = await listAuditEvents(200);
  const start = (page - 1) * pageSize;
  const chunk = events.slice(start, start + pageSize);

  return {
    events: chunk.map((event: any) => ({
      id: event.id,
      timestamp: new Date(event.createdAt).toISOString(),
      eventType: event.eventType,
      description:
        event.metadata?.title ||
        event.metadata?.message ||
        `${event.entityType} ${event.eventType}`,
      actor: event.actorId || (event.metadata?.assignedBot as string) || 'System',
      sourceIntegration:
        event.metadata?.sourceIntegration ||
        (event.metadata?.url ? 'GitHub' : 'Internal'),
    })),
    page,
    pageSize,
    hasMore: start + pageSize < events.length,
  };
}

export async function getV2TodayFeed(): Promise<V2TodayFeed> {
  const [tasksFeed, botsFeed, emailFeed] = await Promise.all([
    getV2TasksFeed(),
    getV2BotsFeed(),
    getEmailSummary(),
  ]);

  const topPriorities: V2DashboardPriorityItem[] = tasksFeed.today
    .filter((item) => item.metadata.priority === 'critical' || item.metadata.priority === 'high' || item.status === 'Blocked')
    .slice(0, 5)
    .map((item) => {
      const action = upsertAction({
        dedupeKey: `task:${item.taskId}`,
        title: item.title,
        source: `From ${item.metadata.department}`,
        bot: item.metadata.assignedBot,
        category: categoryFromRoute(routeForTask({ title: item.title, description: item.metadata.department })),
      });
      return {
        id: action.id,
        title: item.title,
        source: `From ${item.metadata.department}`,
        actionWebhook: `/api/v2/actions/${action.id}/approve`,
        assignedBot: item.metadata.assignedBot,
      };
    });

  const pendingApprovals = summarizePendingApprovals();
  const timeline = buildTimeline(tasksFeed);
  const health = computeHealth(tasksFeed, botsFeed, emailFeed.connected);

  const liveBotActivity = botsFeed.bots.slice(0, 4).map((bot) => ({
    botName: bot.identity.name,
    currentTask: bot.liveState.currentTask,
    status: (bot.liveState.status === 'working'
      ? 'active'
      : bot.liveState.status === 'idle'
        ? 'pending'
        : 'done') as 'active' | 'done' | 'pending',
  }));

  return {
    userContext: {
      userName: process.env.MOTHERSHIP_OPERATOR_NAME || 'Rudolph',
      greeting: 'Good afternoon',
    },
    timeline,
    topPriorities,
    liveBotActivity,
    systemHealth: health,
    pendingApprovals,
  };
}

function buildTimeline(tasks: V2TasksFeed): V2TodayFeed['timeline'] {
  const base = new Date();
  const events = [
    { offsetHours: 0, title: 'Review overnight activity' },
    { offsetHours: 2, title: 'Strategic planning session' },
    { offsetHours: 5, title: 'Finance review' },
    { offsetHours: 7, title: 'Bot performance check' },
  ];
  const dynamic = tasks.today.slice(0, 2).map((task, index) => ({
    offsetHours: 9 + index,
    title: task.title,
  }));

  return [...events, ...dynamic].map((item, index) => {
    const when = new Date(base.getTime() + item.offsetHours * 60 * 60 * 1000);
    return {
      time: when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      title: item.title,
      iconType: index === 0 ? 'check' : 'clock',
    };
  });
}

function summarizePendingApprovals(): V2PendingApprovalSummary[] {
  const items = [...actionStore.values()].filter((item) => !item.approvedAt);
  const grouped = new Map<V2PendingApprovalSummary['category'], number>();
  for (const item of items) {
    grouped.set(item.category, (grouped.get(item.category) ?? 0) + 1);
  }
  return [...grouped.entries()].map(([category, count]) => ({
    category,
    count,
    description:
      category === 'email'
        ? `${count} email drafts from Ruby`
        : category === 'finance'
          ? `${count} financial transactions`
          : `${count} pending actions`,
  }));
}

function computeHealth(tasks: V2TasksFeed, bots: V2BotsFeed, emailConnected: boolean): SystemHealthSnapshot {
  const queuePressure = tasks.counters.tracked === 0 ? 100 : Math.max(45, 100 - Math.round((tasks.counters.blocked / tasks.counters.tracked) * 100));
  const botPerf = bots.bots.length === 0
    ? 100
    : Math.max(55, Math.round(
      (bots.bots.reduce((acc, bot) => acc + bot.throughputMetrics.completed, 0) /
        Math.max(1, bots.bots.reduce((acc, bot) => acc + bot.throughputMetrics.completed + bot.throughputMetrics.queued + bot.throughputMetrics.blocked, 0))) * 100
    ));

  return {
    primarySystems: 100,
    botPerformance: botPerf,
    emailProcessing: emailConnected ? 98 : 60,
    dataSync: queuePressure,
  };
}

export function approvePredictiveAction(actionId: string) {
  const action = actionStore.get(actionId);
  if (!action) {
    return { ok: false, status: 404, message: 'Action not found' };
  }

  if (action.approvedAt) {
    return { ok: true, status: 200, idempotent: true, action };
  }

  action.approvedAt = new Date().toISOString();
  actionStore.set(actionId, action);
  publishV2Event('dashboard', 'approval.updated', { actionId, status: 'approved' });
  publishV2Event('bots', 'task.routed', { botName: action.bot, title: action.title });

  return { ok: true, status: 200, idempotent: false, action };
}

export async function mutateTaskFromAction(taskId: string, action: 'start' | 'defer' | 'complete' | 'unblock') {
  if (action === 'start') {
    await updateTask({ id: taskId, status: TaskStatus.IN_PROGRESS });
  } else if (action === 'defer') {
    await updateTask({ id: taskId, status: TaskStatus.TODO });
  } else if (action === 'complete') {
    await updateTask({ id: taskId, status: TaskStatus.DONE });
  } else if (action === 'unblock') {
    await updateTask({ id: taskId, status: TaskStatus.IN_PROGRESS });
  }
}
