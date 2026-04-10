import crypto from 'node:crypto';
import { TaskPriority, TaskStatus } from '@prisma/client';
import { listTasks, updateTask } from '@/lib/services/tasks';
import { listFinancePlans } from '@/lib/services/finance';
import { getEmailSummary } from '@/lib/services/email';
import { fetchTodayCalendarEvents } from '@/lib/services/calendar';
import { listAuditEvents } from '@/lib/services/audit';
import { dispatchToOpenClaw } from '@/lib/services/openclaw';
import { publishV2Event } from '@/lib/v2/event-bus';
import { prisma } from '@/lib/prisma';
import type {
  BotRouteKey,
  SystemHealthSnapshot,
  V2ActivityFeed,
  V2BotProfile,
  V2BotsFeed,
  V2DashboardPriorityItem,
  V2DashboardTimelineItem,
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
const sentDrafts = new Set<string>();

const BOT_PROFILES: Array<{
  key: BotRouteKey;
  name: string;
  role: string;
  workingStyle: string;
  personality: string;
  strengths: string[];
  colorKey: 'mint' | 'pink' | 'sky' | 'lemon' | 'lavender';
  iconKey: 'trending-up' | 'mail' | 'search' | 'file-text';
}> = [
  {
    key: 'adrian',
    name: 'Adrian',
    role: 'Financial Operations',
    colorKey: 'mint',
    iconKey: 'trending-up',
    workingStyle: 'Methodical and reconciliation-first',
    personality: 'Calm, detail-first operator',
    strengths: ['Financial analysis', 'Data reconciliation', 'Exception flagging'],
  },
  {
    key: 'ruby',
    name: 'Ruby',
    role: 'Comms & Writing',
    colorKey: 'pink',
    iconKey: 'mail',
    workingStyle: 'Fast iteration with tone-aware variants',
    personality: 'Warm, direct, and pragmatic',
    strengths: ['Email drafting', 'Message sequencing', 'Narrative clarity'],
  },
  {
    key: 'emerald',
    name: 'Emerald',
    role: 'Research & Synthesis',
    colorKey: 'sky',
    iconKey: 'search',
    workingStyle: 'Evidence-first synthesis',
    personality: 'Curious and structured',
    strengths: ['Research synthesis', 'Briefing', 'Comparative analysis'],
  },
  {
    key: 'adobe',
    name: 'Adobe Pettaway',
    role: 'Document Intelligence',
    colorKey: 'lemon',
    iconKey: 'file-text',
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
  if (sentDrafts.has(emailId)) return;
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
    const tz = process.env.APP_TIMEZONE || 'America/New_York';
    const dueAtISO = task.dueAt ? new Date(task.dueAt).toISOString() : null;
    const timeframe = dueAtISO
      ? new Date(dueAtISO).toLocaleDateString('en-US', { timeZone: tz, month: 'numeric', day: 'numeric', year: 'numeric' })
      : 'Today';
    return {
      taskId: String(task.id),
      status: mapTaskStatus(task.status as TaskStatus),
      title: task.title,
      metadata: {
        timeframe,
        dueAtISO,
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
      identity: { name: profile.name, role: profile.role, colorKey: profile.colorKey, iconKey: profile.iconKey },
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
  // Make each section failure-independent
  let accounts: any[] = [];
  let payables: any[] = [];
  let transactions: any[] = [];
  let plans: any[] = [];
  // Get all datasets independently
  await Promise.all([
    (async () => {
      try {
        accounts = await prisma.account.findMany({ orderBy: { createdAt: 'asc' } });
      } catch (error) {
        console.error('[finance_adapter:accounts]', error);
        accounts = [];
      }
    })(),
    (async () => {
      try {
        payables = await prisma.payable.findMany({
          where: { status: { in: ['pending', 'overdue'], mode: 'insensitive' } },
          orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
          take: 10,
        });
      } catch (error) {
        console.error('[finance_adapter:payables]', error);
        payables = [];
      }
    })(),
    (async () => {
      try {
        transactions = await prisma.transaction.findMany({
          orderBy: { occurredAt: 'desc' },
          take: 20,
          include: { account: true },
        });
      } catch (error) {
        console.error('[finance_adapter:transactions]', error);
        transactions = [];
      }
    })(),
    (async () => {
      try {
        plans = await listFinancePlans();
      } catch (error) {
        console.error('[finance_adapter:plans]', error);
        plans = [];
      }
    })(),
  ]);

  const mappedPlans = plans.map((plan) => {
    const progressPercent = plan.currentValue != null && plan.targetValue != null && plan.targetValue !== 0
      ? Math.min(100, Math.round((plan.currentValue / plan.targetValue) * 100))
      : null;
    return {
      id: plan.id,
      title: plan.title,
      type: plan.type,
      status: plan.status,
      description: plan.description,
      goal: plan.goal,
      currentValue: plan.currentValue,
      targetValue: plan.targetValue,
      unit: plan.unit,
      startDate: plan.startDate ? plan.startDate.toISOString() : null,
      targetDate: plan.targetDate ? plan.targetDate.toISOString() : null,
      managedByBot: plan.managedByBot,
      milestones: Array.isArray(plan.milestones) ? plan.milestones : [],
      progressPercent,
      notes: plan.notes,
      updatedAt: plan.updatedAt?.toISOString?.() ?? null,
    };
  });

  return {
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: account.balance,
      trendPercentage: '—',
    })),
    payables: payables.map((payable) => ({
      vendor: payable.vendor,
      amount: payable.amount,
      dueDate: payable.dueDate ? payable.dueDate.toISOString().slice(0, 10) : 'Unscheduled',
      status: (payable.status?.toLowerCase() ?? 'pending') as 'pending' | 'paid' | 'overdue',
    })),
    transactions: transactions.map((transaction) => ({
      date: transaction.occurredAt
        ? new Date(transaction.occurredAt).toISOString().slice(0, 10)
        : '',
      description: transaction.description ?? 'Transaction',
      category: transaction.category ?? 'General',
      amount: transaction.amount,
      // If you have an agent field, use it. Default to Adrian.
      handledByBot: transaction.handledByBot ?? 'Adrian',
    })),
    plans: mappedPlans,
  };
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

  // Sort tasks: overdue first (past dueAt), then by dueAt ascending, then undated
  const allPendingTasks = [...tasksFeed.active, ...tasksFeed.today].filter((t, i, arr) => t.status !== 'Done' && arr.findIndex((x) => x.taskId === t.taskId) === i);
  const sortedTasks = [...allPendingTasks].sort((a, b) => {
    const now = Date.now();
    const aTime = a.metadata.dueAtISO ? new Date(a.metadata.dueAtISO).getTime() : null;
    const bTime = b.metadata.dueAtISO ? new Date(b.metadata.dueAtISO).getTime() : null;
    const aOverdue = aTime !== null && aTime < now;
    const bOverdue = bTime !== null && bTime < now;
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    if (aTime !== null && bTime !== null) return aTime - bTime;
    if (aTime !== null) return -1;
    if (bTime !== null) return 1;
    return 0;
  });

  const topPriorities: V2DashboardPriorityItem[] = sortedTasks
    .slice(0, 10)
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
        taskId: item.taskId,
        title: item.title,
        source: `From ${item.metadata.department}`,
        actionWebhook: `/api/v2/actions/${action.id}/approve`,
        assignedBot: item.metadata.assignedBot,
        dueAt: item.metadata.dueAtISO ?? null,
      };
    });

  const pendingApprovals = summarizePendingApprovals();
  const timeline = await buildTimeline(tasksFeed);

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
      greeting: getTimeAwareGreeting(),
      affirmation: getDailyAffirmation(),
    },
    timeline,
    topPriorities,
    liveBotActivity,
    systemHealth: null,
    pendingApprovals,
  };
}

function getTimeAwareGreeting(): string {
  const tz = process.env.APP_TIMEZONE || 'America/New_York';
  const hour = parseInt(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: tz }), 10);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

const AFFIRMATIONS = [
  'You move with intention and grace.',
  'Your clarity creates momentum for everyone around you.',
  'Today is built for focus. Trust your rhythm.',
  'Every system you touch gets sharper.',
  'The work you do today compounds into something extraordinary.',
  'You are exactly where you need to be — and ahead of schedule.',
  'Your attention is your superpower. Spend it wisely today.',
  'Small consistent actions. That\'s how empires are built.',
  'The team is stronger because you showed up.',
  'Progress over perfection. Let\'s get it done.',
  'You don\'t just manage operations — you orchestrate them.',
  'Your bots are working. Your systems are running. Now breathe.',
  'What you build today, your future self will thank you for.',
  'Discipline is choosing between what you want now and what you want most.',
  'The details matter. And you notice every single one.',
];

function getDailyAffirmation(): string {
  // Deterministic for the day so it doesn't change on every refresh
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return AFFIRMATIONS[dayOfYear % AFFIRMATIONS.length];
}

async function buildTimeline(tasks: V2TasksFeed): Promise<V2TodayFeed['timeline']> {
  const { events: calEvents } = await fetchTodayCalendarEvents();
  const now = new Date();
  const items: V2DashboardTimelineItem[] = [];

  // 1. Add calendar events
  for (const ev of calEvents) {
    items.push({
      time: ev.startTime,
      endTime: ev.endTime,
      title: ev.title,
      iconType: ev.status === 'done' ? 'check' : ev.status === 'current' ? 'spark' : 'clock',
      status: ev.status,
      type: 'calendar',
      meetingUrl: ev.meetingUrl,
      startDate: ev.startDate,
      endDate: ev.endDate,
      isDraggable: false,
    });
  }

  // 2. Add today's high-priority tasks as timeline items
  const tasksForTimeline = tasks.today
    .filter((t) => t.status !== 'Done')
    .slice(0, 6);

  for (const task of tasksForTimeline) {
    // Place tasks in gaps or after calendar events
    const when = new Date(now);
    const lastCalEnd = items.length > 0 && items[items.length - 1].endDate
      ? new Date(items[items.length - 1].endDate!)
      : null;

    if (lastCalEnd && lastCalEnd > when) {
      when.setTime(lastCalEnd.getTime());
    }
    // Only add task timeline entries if no calendar events
    // (when calendar is connected, tasks stay in Top Priorities for drag-drop)
    if (calEvents.length === 0) {
      const syntheticHour = 9 + items.length;
      const tzLabel = process.env.APP_TIMEZONE || 'America/New_York';
      const localDateStr = now.toLocaleDateString('en-CA', { timeZone: tzLabel });
      const syntheticLocal = new Date(`${localDateStr}T${String(syntheticHour).padStart(2, '0')}:00:00`);
      when.setTime(syntheticLocal.getTime());
      const isPast = now > when;
      const isCurrent = !isPast && items.filter((i) => i.status !== 'done').length === 0;
      items.push({
        time: when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tzLabel }),
        title: task.title,
        iconType: isPast ? 'check' : isCurrent ? 'spark' : 'clock',
        status: isPast ? 'done' : isCurrent ? 'current' : 'upcoming',
        type: 'task',
        taskId: task.taskId,
        assignedBot: task.metadata.assignedBot,
        startDate: when.toISOString(),
        isDraggable: true,
      });
    }
  }

  // 3. Detect focus blocks (gaps > 30 min between calendar events, or after a single event through end of day)
  if (calEvents.length >= 1) {
    const tzLabel2 = process.env.APP_TIMEZONE || 'America/New_York';
    const localDateStr2 = now.toLocaleDateString('en-CA', { timeZone: tzLabel2 });
    const endOfDay = new Date(`${localDateStr2}T23:59:59`);

    const sorted = [...calEvents].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    // Check gaps between consecutive events
    for (let i = 0; i < sorted.length - 1; i++) {
      const endCurrent = sorted[i].endDate ?? sorted[i].startDate;
      const startNext = sorted[i + 1].startDate;
      const gapMs = new Date(startNext).getTime() - new Date(endCurrent).getTime();
      const gapMin = gapMs / 60000;
      if (gapMin >= 30) {
        const focusStart = new Date(endCurrent);
        const gapHours = Math.floor(gapMin / 60);
        const gapRemMin = Math.round(gapMin % 60);
        const durationLabel = gapHours > 0
          ? `${gapHours}h${gapRemMin > 0 ? ` ${gapRemMin}m` : ''}`
          : `${gapRemMin}m`;
        items.push({
          time: focusStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tzLabel2 }),
          title: `Focus Block — ${durationLabel} available`,
          iconType: 'focus',
          status: now > new Date(startNext) ? 'done' : now >= focusStart ? 'current' : 'upcoming',
          type: 'focus-block',
          startDate: focusStart.toISOString(),
          endDate: startNext,
          isDraggable: false,
        });
      }
    }

    // Check gap after the last event through end of day
    const lastEvent = sorted[sorted.length - 1];
    const lastEnd = lastEvent.endDate ?? lastEvent.startDate;
    const gapAfterMs = endOfDay.getTime() - new Date(lastEnd).getTime();
    const gapAfterMin = gapAfterMs / 60000;
    if (gapAfterMin >= 30) {
      const focusStart = new Date(lastEnd);
      const gapHours = Math.floor(gapAfterMin / 60);
      const gapRemMin = Math.round(gapAfterMin % 60);
      const durationLabel = gapHours > 0
        ? `${gapHours}h${gapRemMin > 0 ? ` ${gapRemMin}m` : ''}`
        : `${gapRemMin}m`;
      items.push({
        time: focusStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tzLabel2 }),
        title: `Focus Block — ${durationLabel} available`,
        iconType: 'focus',
        status: now > endOfDay ? 'done' : now >= focusStart ? 'current' : 'upcoming',
        type: 'focus-block',
        startDate: focusStart.toISOString(),
        endDate: endOfDay.toISOString(),
        isDraggable: false,
      });
    }
  }

  // Sort everything by startDate
  items.sort((a, b) => {
    const aTime = a.startDate ? new Date(a.startDate).getTime() : 0;
    const bTime = b.startDate ? new Date(b.startDate).getTime() : 0;
    return aTime - bTime;
  });

  if (items.length > 0) return items;

  // Placeholder when nothing is available
  return [
    {
      time: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      title: 'No events today — drag tasks here or connect Google Calendar',
      iconType: 'alert',
      status: 'current',
      type: 'calendar',
      startDate: now.toISOString(),
      isDraggable: false,
    },
  ];
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


// ---------------------------------------------------------------------------
// Draft store accessors — used by the ruby-custom send route
// ---------------------------------------------------------------------------
export function getRubyDraft(emailId: string): V2EmailDraft | undefined {
  return rubyDraftStore.get(emailId);
}

export function markDraftSent(emailId: string): void {
  sentDrafts.add(emailId);
  rubyDraftStore.delete(emailId);
  pendingRubyDrafts.delete(emailId);
}
