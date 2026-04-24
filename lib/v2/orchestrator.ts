import crypto from 'node:crypto';
import { TaskPriority, TaskStatus } from '@/lib/db/prisma-types';
import { listTasks, updateTask } from '@/lib/services/tasks';
import { isTaskPoolRepositorySource, addVisionBoardLabelToIssue } from '@/lib/integrations/task-pool';
import { listFinancePlans } from '@/lib/services/finance';
import { getEmailSummary } from '@/lib/services/email';
import { fetchTodayCalendarEvents } from '@/lib/services/calendar';
import { listAuditEvents } from '@/lib/services/audit';
import { dispatchToOpenClaw } from '@/lib/services/openclaw';
import { publishV2Event } from '@/lib/v2/event-bus';
import { prisma } from '@/lib/prisma';
import { getOrCreateVisionBoard, listVisionPillars } from '@/lib/services/vision';
import type {
  BotRouteKey,
  V2ActivityFeed,
  V2BotProfile,
  V2BotsFeed,
  V2CashFlowForecast,
  V2DashboardPriorityItem,
  V2DashboardTimelineItem,
  V2EmailDraft,
  V2EmailDraftFeed,
  V2EmailFeed,
  V2EmailItem,
  V2FinanceOverviewFeed,
  V2HealthScore,
  V2IncomeSource,
  V2NetWorthPoint,
  V2Subscription,
  V2TaskItem,
  V2TasksFeed,
  V2TodayFeed,
  V2VisionBoardFeed,
  V2VisionItem,
  V2VisionLinkedCampaign,
  V2VisionLinkedFinancePlan,
  V2VisionLinkedTask,
  V2VisionPillar,
} from '@/lib/v2/types';

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
  iconKey: 'trending-up' | 'mail' | 'search' | 'file-text' | 'anchor';
}> = [
  {
    key: 'adrian',
    name: 'Drake',
    role: 'Automation & System Operations',
    colorKey: 'mint',
    iconKey: 'trending-up',
    workingStyle: 'Executes commands, shifts mode by task — calm, surgical, or full-send depending on what the moment demands',
    personality: 'Full-spectrum operator — he chooses the mode, then owns it completely',
    strengths: ['Automation & orchestration', 'Infrastructure & deployment', 'System health monitoring'],
  },
  {
    key: 'ruby',
    name: 'Drizzy',
    role: 'Personal Communication & Life Management',
    colorKey: 'pink',
    iconKey: 'mail',
    workingStyle: 'Tone-aware navigation of relationships, messages, and life logistics — keeps everything flowing',
    personality: 'Warm, disarming, and relationship-first — talks to people, not at them',
    strengths: ['Personal messaging', 'Social & life coordination', 'Relationship interactions'],
  },
  {
    key: 'emerald',
    name: 'Champagne Papi',
    role: 'Analysis, Verification & Financial Intelligence',
    colorKey: 'sky',
    iconKey: 'search',
    workingStyle: 'Reads the numbers for leverage — data, risk, and positioning before anyone else sees it',
    personality: 'Calculated and expensive — sees through the surface to what the money is actually saying',
    strengths: ['Financial intelligence & cash flow analysis', 'System verification & QA', 'Strategic diagnostics & pattern detection'],
  },
  {
    key: 'adobe',
    name: 'Aubrey Graham',
    role: 'Document Intelligence',
    colorKey: 'lemon',
    iconKey: 'file-text',
    workingStyle: "Quiet, precise extraction — reads what's there, reports what's true",
    personality: 'No persona, no performance — just what the document actually says',
    strengths: ['Document parsing', 'Entity extraction', 'Validation checks'],
  },
  {
    key: 'anchor',
    name: '6 God',
    role: 'Execution Coordination & Human Follow-through',
    colorKey: 'lavender',
    iconKey: 'anchor',
    workingStyle: 'No softness, no overthinking — collapses indecision and forces movement on stalled execution',
    personality: 'Dominant and pressure-first — she runs this, no discussion',
    strengths: ['Priority sequencing', 'Ownership and accountability coordination', 'Re-entry planning and completion support'],
  },
];

function routeForTask(task: any): BotRouteKey {
  // Explicit assignee takes priority over keyword inference
  const assignee = String(task.assignee ?? '').toLowerCase().trim();
  if (assignee === 'adrian' || assignee === 'main' || assignee === 'drake') return 'adrian';
  if (assignee === 'ruby' || assignee === 'drizzy') return 'ruby';
  if (assignee === 'emerald' || assignee === 'champagne papi') return 'emerald';
  if (assignee === 'adobe' || assignee === 'adobe pettaway' || assignee === 'aubrey graham') return 'adobe';
  if (assignee === 'anchor' || assignee === 'ballast' || assignee === '6 god') return 'anchor';

  // Fall back to keyword inference from title + description
  const title = String(task.title ?? '').toLowerCase();
  const description = String(task.description ?? '').toLowerCase();
  const haystack = `${title} ${description}`;
  // Emerald: analysis, verification, financial intelligence, diagnostics
  if (haystack.match(/analyz|audit|verif|diagnos|investigat|pattern|architecture|dashboard|finance|financial|budget|cash.?flow|debt|invest|ledger|invoice|expense|payment|bill|liquidity|forecast|leverage|reconcil/)) return 'emerald';
  // Ruby: personal communication, social coordination, life management
  if (haystack.match(/email|reply|message|copy|comms|outreach|personal|social|relationship|schedule/)) return 'ruby';
  // Adobe: document parsing and extraction
  if (haystack.match(/doc|contract|pdf|form|extract|intake/)) return 'adobe';
  // Anchor: execution coordination, prioritization, and follow-through
  if (haystack.match(/prioriti|sequence|coordina|follow.?through|re.?entry|ownership|accountabil|stall|friction|handoff|unblock people/)) return 'anchor';
  // Adrian: automation, infrastructure, system operations
  if (haystack.match(/automat|deploy|infrastructure|script|command|system|health|orchestrat|build|install|setup|run /)) return 'adrian';
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

function relativeTime(input: Date) {
  const diffMs = Date.now() - input.getTime();
  const mins = Math.max(1, Math.round(diffMs / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return `${hours} hr ago`;
}

export function deterministicTemplateDrafts(
  emailId: string,
  subject: string,
  senderName: string = '',
  preview: string = '',
): V2EmailDraft[] {
  const lowered = (subject + ' ' + preview).toLowerCase();
  const firstName = senderName.split(/\s+/)[0] || '';
  const greeting = firstName ? `Hi ${firstName},\n\n` : 'Hi,\n\n';
  const signoff = '\n\nBest,';
  const subjectRef = subject ? `"${subject}"` : 'your message';

  const isMeeting = /\b(meeting|schedule|calendar|call|sync|catch.?up)\b/.test(lowered);
  const isPayment = /\b(invoice|payment|bill|charge|receipt|transaction|order)\b/.test(lowered);
  const isPromo = /(\d+%\s*off|\bsale\b|\bdeal\b|discount|promo|checkout|shop now|limited.?time|flash sale|marketing)/.test(lowered);
  const isNewsletter = /\b(newsletter|weekly|digest|roundup|recap|edition|unsubscribe)\b/.test(lowered);
  const isDelivery = /\b(shipping|delivery|shipped|tracking|package|dispatch|arrived|out for delivery)\b/.test(lowered);
  const isOpportunity = /\b(job|opportunity|career|position|role|hiring|candidate|interview|apply|partnership|collaboration)\b/.test(lowered);
  const isEvent = /\b(event|invite|invitation|conference|webinar|summit|workshop)\b/.test(lowered);

  let enthusiasticBody: string;
  let measuredBody: string;
  let declineBody: string;

  if (isMeeting) {
    enthusiasticBody = `${greeting}Thanks for reaching out — I'd love to connect! I'm available Tuesday afternoon or Wednesday morning. Let me know which works best and I'll get it on the calendar.\n\nLooking forward to it!${signoff}`;
    measuredBody = `${greeting}Thank you for the note. I'm open to scheduling time this week. Could you share two or three preferred slots along with a brief agenda so I can prepare accordingly?${signoff}`;
    declineBody = `${greeting}Thank you for the invitation. I appreciate you thinking of me, but I'm not able to take on additional meetings at this time. I hope we can reconnect when timing is better.${signoff}`;
  } else if (isPayment) {
    enthusiasticBody = `${greeting}Thanks for sending this over — we're on it! I'm reviewing the details now and will confirm payment timing with you shortly.${signoff}`;
    measuredBody = `${greeting}Thank you for this. We're currently reviewing the details and will follow up with a confirmed response once our review is complete. Please let me know if you need anything in the meantime.${signoff}`;
    declineBody = `${greeting}Thank you for the note. After careful review, we're not able to proceed with this at this time. I appreciate your understanding.${signoff}`;
  } else if (isPromo) {
    enthusiasticBody = `${greeting}Thanks for sharing this offer! I'll take a closer look and may follow up if it's something I'd like to move on.${signoff}`;
    measuredBody = `${greeting}Thank you for the promotional information. I've noted the details and will follow up if I decide to take action on this.${signoff}`;
    declineBody = `${greeting}Thank you for reaching out. I'm not in a position to take advantage of this offer at this time, but I appreciate you sharing it.${signoff}`;
  } else if (isNewsletter) {
    enthusiasticBody = `${greeting}Thanks for this — great content as always! I'll pass it along to a few colleagues who I think would find it valuable.${signoff}`;
    measuredBody = `${greeting}Thank you for the update. I've reviewed the content and will follow up if anything on our end warrants a response.${signoff}`;
    declineBody = `${greeting}Thank you for keeping me on the list. I'd like to unsubscribe from future editions as my priorities have shifted. I appreciate the content you've shared.${signoff}`;
  } else if (isDelivery) {
    enthusiasticBody = `${greeting}Got it — thanks for the update! Looking forward to receiving this.${signoff}`;
    measuredBody = `${greeting}Thank you for the shipping confirmation. I'll keep an eye out and follow up if anything looks off.${signoff}`;
    declineBody = `${greeting}There seems to be an issue with this delivery. Could someone from your team please follow up with more details?${signoff}`;
  } else if (isOpportunity) {
    enthusiasticBody = `${greeting}Thank you for reaching out about this opportunity — it sounds genuinely interesting and aligns well with my background. I'd love to learn more. Can we set up a time to connect?${signoff}`;
    measuredBody = `${greeting}Thank you for getting in touch. I'd need a bit more context before I can give this proper consideration. Could you share additional details?${signoff}`;
    declineBody = `${greeting}Thank you for thinking of me for this opportunity. After careful consideration, I'm not in a position to pursue this right now. I wish you the best.${signoff}`;
  } else if (isEvent) {
    enthusiasticBody = `${greeting}Thanks for the invitation — this sounds like a fantastic event! I'm planning to attend and look forward to connecting with everyone there.${signoff}`;
    measuredBody = `${greeting}Thank you for the invitation. I'm reviewing my schedule and will confirm my attendance shortly. Could you share any additional details about the agenda?${signoff}`;
    declineBody = `${greeting}Thank you for the invitation. Unfortunately I'm not able to attend this time, but I'd love to be kept in the loop for future events. I hope it goes well!${signoff}`;
  } else {
    enthusiasticBody = `${greeting}Thanks for reaching out about ${subjectRef}. This looks interesting — I'd love to move this forward. I'll review the details and follow up with next steps by end of week.${signoff}`;
    measuredBody = `${greeting}Thank you for your message about ${subjectRef}. I've noted the details and would like to clarify a few points before responding fully. Could you provide a bit more context?${signoff}`;
    declineBody = `${greeting}Thank you for reaching out about ${subjectRef}. After careful consideration, this isn't the right fit at this time. I appreciate you thinking of me and hope we can connect on something in the future.${signoff}`;
  }

  return [
    {
      id: `${emailId}-enthusiastic`,
      tone: 'Enthusiastic',
      body: enthusiasticBody,
      approveWebhook: `/api/v2/email/send/${emailId}/enthusiastic`,
      source: 'template',
    },
    {
      id: `${emailId}-measured`,
      tone: 'Measured',
      body: measuredBody,
      approveWebhook: `/api/v2/email/send/${emailId}/measured`,
      source: 'template',
    },
    {
      id: `${emailId}-decline`,
      tone: 'Decline',
      body: declineBody,
      approveWebhook: `/api/v2/email/send/${emailId}/decline`,
      source: 'template',
    },
  ];
}

async function generateRubyDraft(emailId: string, subject: string, preview: string, senderName: string = '') {
  if (pendingRubyDrafts.has(emailId)) return;
  if (sentDrafts.has(emailId)) return;
  pendingRubyDrafts.add(emailId);

  const firstName = senderName.split(/\s+/)[0] || '';
  const greeting = firstName ? `Hi ${firstName},\n\n` : 'Hi,\n\n';
  const subjectRef = subject ? `"${subject}"` : 'your message';

  let body: string;
  try {
    const result = await dispatchToOpenClaw({
      agentId: 'ruby',
      text: `Write a professional email reply to the following message. Be genuinely helpful and contextually appropriate — choose the response style that best fits the content (engaging, informational, action-oriented, declining, etc.). Include a greeting, a 2–3 sentence response, and a sign-off. Write only the reply body; do not include a subject line.\n\nSubject: ${subject}\nMessage preview: ${preview}`,
      sessionKey: `email-${emailId}`,
    });
    body = result.output?.trim() || `${greeting}Thank you for your message about ${subjectRef}. I've reviewed the details and will follow up with a more complete response shortly.\n\nBest,`;
  } catch {
    // Fall back to a context-aware draft so the option doesn't hang indefinitely
    body = `${greeting}Thank you for your message about ${subjectRef}. I've reviewed the details and will follow up with a more complete response shortly.\n\nBest,`;
  }

  const rubyDraft: V2EmailDraft = {
    id: `${emailId}-ruby-custom`,
    tone: 'Ruby Custom',
    body,
    approveWebhook: `/api/v2/email/send/${emailId}/ruby-custom`,
    source: 'ruby_custom',
  };
  rubyDraftStore.set(emailId, rubyDraft);
  // Persist to DB so draft survives serverless cold starts
  try {
    await prisma.emailDraftSuggestion.create({
      data: {
        emailExternalId: emailId,
        tone: 'Ruby Custom',
        body,
        source: 'ruby_custom',
      },
    });
  } catch { /* best-effort — in-memory cache is still populated */ }
  publishV2Event(`email-drafts:${emailId}`, 'draft.generated', {
    emailId,
    draft: rubyDraft,
  });
  pendingRubyDrafts.delete(emailId);
}

export async function getV2TasksFeed(): Promise<V2TasksFeed> {
  const tasks = (await listTasks()) as any[];

  // Build taskId → visionItemId map for badge display
  // Wrapped in try-catch: DB may be unreachable when using task-pool source
  let visionLinks: { taskId: string; visionItemId: string }[] = [];
  try {
    visionLinks = await prisma.visionTaskLink.findMany();
  } catch (err) {
    console.warn('[getV2TasksFeed] visionTaskLink query failed, skipping vision badges:', err instanceof Error ? err.message : String(err));
  }
  const taskVisionMap = new Map(visionLinks.map((l) => [l.taskId, l.visionItemId]));

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
      visionItemId: taskVisionMap.get(String(task.id)) ?? null,
      visionBoardLinked: (task as any).domain === 'vision board',
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
        type: profile.key === 'emerald' ? 'finance' : profile.key,
      }));

    return {
      identity: { name: profile.name, role: profile.role, colorKey: profile.colorKey, iconKey: profile.iconKey },
      liveState: {
        currentTask: current?.title ?? 'Awaiting assignment',
        status: current ? (current.status === TaskStatus.BLOCKED ? 'blocked' : 'working') : 'idle',
      },
      throughputMetrics: assigned.reduce(
        (acc, task) => {
          if (task.status === TaskStatus.DONE)         acc.completed++;
          else if (task.status === TaskStatus.TODO)    acc.queued++;
          else if (task.status === TaskStatus.BLOCKED) acc.blocked++;
          return acc;
        },
        { completed: 0, queued: 0, blocked: 0 },
      ),
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
  const integration: V2EmailItem['sourceIntegration'] =
    summary.provider === 'zoho' ? 'Zoho' : summary.provider === 'gmail' || summary.provider === 'both' ? 'Gmail' : 'Internal';
  const inbox: V2EmailItem[] = summary.previews.map((preview) => ({
    id: preview.id,
    sender: preview.from,
    subject: preview.subject,
    preview: preview.snippet ?? preview.subject,
    snippet: preview.snippet,
    gmailLink: preview.gmailLink,
    timestamp: preview.date,
    isRead: false,
    sourceIntegration: (preview as { gmailLink?: string }).gmailLink ? 'Gmail' : integration,
  }));
  return { inbox };
}

export async function getV2EmailDrafts(emailId: string): Promise<V2EmailDraftFeed> {
  const inbox = await getV2EmailFeed();
  const selected = inbox.inbox.find((item) => item.id === emailId);
  const fallbackSubject = selected?.subject ?? 'New request';
  const fallbackPreview = selected?.preview ?? 'Please draft a response.';
  const rawSender = selected?.sender ?? '';
  const senderMatch = rawSender.match(/^([^<]+)/);
  const senderName = senderMatch ? senderMatch[1].trim().replace(/^"(.*)"$/, '$1') : '';

  const drafts = deterministicTemplateDrafts(emailId, fallbackSubject, senderName, fallbackPreview);

  // Check memory + DB so a previously generated draft is included in the initial response
  // (avoids the SSE race condition where the event fires before the client subscribes)
  const rubyDraft = await getRubyDraftWithFallback(emailId);
  if (rubyDraft) {
    drafts.push(rubyDraft);
  } else {
    void generateRubyDraft(emailId, fallbackSubject, fallbackPreview, senderName);
  }

  return {
    emailId,
    drafts,
    streamId: `email-drafts:${emailId}`,
  };
}

export async function getV2FinanceOverview(): Promise<V2FinanceOverviewFeed> {
  const assembledAt = new Date();
  // Make each section failure-independent
  let accounts: any[] = [];
  let payables: any[] = [];
  let transactions: any[] = [];
  let plans: any[] = [];
  let events: any[] = [];
  let merchantTotal = 0;
  let merchantsUncategorized: any[] = [];
  let budgetRows: any[] = [];
  let forecast: V2CashFlowForecast | null = null;
  let subscriptions: V2Subscription[] = [];
  let incomeSources: V2IncomeSource[] = [];
  let netWorthHistory: V2NetWorthPoint[] = [];
  let healthScore: V2HealthScore | null = null;
  let systemStatus: 'ok' | 'partial' = 'ok';
  // Get all datasets independently
  await Promise.all([
    (async () => {
      try {
        accounts = await prisma.account.findMany({ orderBy: { createdAt: 'asc' } });
      } catch (error) {
        systemStatus = 'partial'; console.error('[finance_adapter:accounts]', error);
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
        systemStatus = 'partial'; console.error('[finance_adapter:payables]', error);
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
        systemStatus = 'partial'; console.error('[finance_adapter:transactions]', error);
        transactions = [];
      }
    })(),
    (async () => {
      try {
        plans = await listFinancePlans();
      } catch (error) {
        systemStatus = 'partial'; console.error('[finance_adapter:plans]', error);
        plans = [];
      }
    })(),
    (async () => {
      try {
        events = await prisma.financeEvent.findMany({
          where: { resolved: false },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });
      } catch (error) {
        systemStatus = 'partial'; console.error('[finance_adapter:events]', error);
        events = [];
      }
    })(),
    (async () => {
      try {
        [merchantTotal, merchantsUncategorized] = await Promise.all([
          prisma.merchantProfile.count(),
          prisma.merchantProfile.findMany({
            where: { defaultCategory: null },
            orderBy: { transactionCount: 'desc' },
            take: 10,
          }),
        ]);
      } catch (error) {
        systemStatus = 'partial'; console.error('[finance_adapter:merchants]', error);
      }
    })(),
    (async () => {
      try {
        const { calculateBudget, checkBudgetThresholds } = await import('@/lib/finance/budget');
        budgetRows = await calculateBudget();
        // Fire-and-forget threshold check — emits events if needed
        checkBudgetThresholds().catch(() => {});
      } catch (error) {
        systemStatus = 'partial'; console.error('[finance_adapter:budget]', error);
        budgetRows = [];
      }
    })(),
    (async () => {
      try {
        const { scanSubscriptionOverlaps } = await import('@/lib/finance/subscriptionOverlapDetector');
        // Fire-and-forget — emits SUBSCRIPTION_OVERLAP events as needed
        scanSubscriptionOverlaps().catch(() => {});
      } catch (error) {
        systemStatus = 'partial'; console.error('[finance_adapter:overlapDetector]', error);
      }
    })(),
    (async () => {
      try {
        const { runCashFlowForecast } = await import('@/lib/finance/cashflowForecast');
        forecast = await runCashFlowForecast();
      } catch (error) {
        systemStatus = 'partial'; console.error('[finance_adapter:forecast]', error);
        forecast = null;
      }
    })(),
    (async () => {
      try {
        const MONTHLY_MULT: Record<string, number> = {
          weekly: 4.33, biweekly: 2.167, monthly: 1, quarterly: 1 / 3, annual: 1 / 12,
        };
        const INTERVAL_DAYS: Record<string, number> = {
          weekly: 7, biweekly: 14, monthly: 30, quarterly: 91, annual: 365,
        };
        const confirmed = await prisma.merchantProfile.findMany({
          where: { isSubscription: true, subscriptionConfirmed: true, billingInterval: { not: null } },
          select: { id: true, merchantName: true, billingInterval: true, defaultCategory: true },
        });
        subscriptions = (
          await Promise.all(
            confirmed.map(async (sub) => {
              const lastTx = await prisma.transaction.findFirst({
                where: { description: { equals: sub.merchantName, mode: 'insensitive' }, amount: { lt: 0 } },
                orderBy: { occurredAt: 'desc' },
                select: { amount: true, occurredAt: true },
              });
              const amount = lastTx ? Math.abs(lastTx.amount) : 0;
              const intervalDays = INTERVAL_DAYS[sub.billingInterval ?? ''] ?? 30;
              const nextChargeDate = lastTx
                ? new Date(new Date(lastTx.occurredAt).getTime() + intervalDays * 86400000)
                    .toISOString().slice(0, 10)
                : null;
              const monthlyEquivalent =
                Math.round(amount * (MONTHLY_MULT[sub.billingInterval ?? 'monthly'] ?? 1) * 100) / 100;
              return {
                id: sub.id,
                merchant: sub.merchantName,
                amount,
                interval: sub.billingInterval ?? 'monthly',
                monthlyEquivalent,
                nextChargeDate,
                category: sub.defaultCategory ?? null,
              };
            })
          )
        ).sort((a, b) => b.monthlyEquivalent - a.monthlyEquivalent);
      } catch (error) {
        systemStatus = 'partial'; console.error('[finance_adapter:subscriptions]', error);
        subscriptions = [];
      }
    })(),
    (async () => {
      try {
        const { listIncomeSources } = await import('@/lib/finance/incomeDetector');
        const sources = await listIncomeSources();
        const now = new Date();
        incomeSources = sources.map((src) => {
          let cursor = new Date(src.lastSeenDate.getTime() + src.avgDays * 86400000);
          while (cursor < now) cursor = new Date(cursor.getTime() + src.avgDays * 86400000);
          return {
            id: src.id,
            source: src.source,
            amount: src.amount,
            interval: src.interval,
            nextPayday: cursor.toISOString().slice(0, 10),
            lastSeen: new Date(src.lastSeenDate).toISOString().slice(0, 10),
            confirmed: src.confirmed,
          };
        });
      } catch (error) {
        systemStatus = 'partial'; console.error('[finance_adapter:incomeSources]', error);
        incomeSources = [];
      }
    })(),
    (async () => {
      try {
        const { recordNetWorthSnapshot, ensureNetWorthHistory, getNetWorthHistory } = await import('@/lib/finance/netWorth');
        recordNetWorthSnapshot().catch(() => {}); // fire-and-forget, idempotent
        // One-time backfill if history is empty (cheap count check each request)
        await ensureNetWorthHistory(30);
        netWorthHistory = await getNetWorthHistory(30);
      } catch (error) {
        systemStatus = 'partial'; console.error('[finance_adapter:netWorth]', error);
        netWorthHistory = [];
      }
    })(),
  ]);

  // Health score runs after the parallel block so it can use budgetRows
  try {
    const { computeHealthScore } = await import('@/lib/finance/healthScore');
    healthScore = await computeHealthScore(budgetRows);
  } catch (error) {
    systemStatus = 'partial'; console.error('[finance_adapter:healthScore]', error);
    healthScore = null;
  }

  // Build vision link lookup for finance plans
  const planIds = plans.map((p: { id: string }) => p.id);
  let visionPlanLinkMap = new Map<string, string>(); // financePlanId → visionItemTitle
  if (planIds.length > 0) {
    try {
      const visionLinks = await prisma.visionFinancePlanLink.findMany({
        where: { financePlanId: { in: planIds } },
        include: { visionItem: { select: { title: true } } },
      });
      for (const link of visionLinks) {
        visionPlanLinkMap.set(link.financePlanId, link.visionItem.title);
      }
    } catch {
      // non-fatal — vision badge is optional
    }
  }

  const mappedPlans = plans.map((plan: any) => {
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
      visionItemTitle: visionPlanLinkMap.get(plan.id) ?? null,
    };
  });

  return {
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: account.balance,
      liquid: account.liquid ?? false,
      updatedAt: account.updatedAt?.toISOString?.() ?? null,
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
      handledByBot: transaction.handledByBot,
    })),
    plans: mappedPlans,
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      source: event.source,
      payload: event.payload ?? {},
      priority: (event.priority ?? 'normal') as 'low' | 'normal' | 'high' | 'critical',
      resolved: event.resolved,
      createdAt: new Date(event.createdAt).toISOString(),
    })),
    merchants: {
      total: merchantTotal,
      uncategorized: merchantsUncategorized.length,
      pendingCategorization: merchantsUncategorized.map((m) => ({
        id: m.id,
        merchantName: m.merchantName,
        transactionCount: m.transactionCount,
        lastSeen: new Date(m.lastSeen).toISOString(),
      })),
    },
    budget: budgetRows,
    forecast,
    subscriptions,
    incomeSources,
    netWorthHistory,
    healthScore,
    generatedAt: assembledAt.toISOString(),
    systemStatus,
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
  const tasksFeed = await getV2TasksFeed();
  const timeline = await buildTimeline(tasksFeed);

  const daily = getDailyAffirmation();
  return {
    userContext: {
      userName: process.env.MOTHERSHIP_OPERATOR_NAME || 'Rudolph',
      greeting: getTimeAwareGreeting(),
      affirmation: daily.text,
      affirmationSource: daily.source,
    },
    timeline,
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

type DailyAffirmation = { text: string; source: string | null };

// Daily Drake-themed motivational lines. These are original prose, not lyrics,
// so they're credited generically to Drake — not to specific songs.
const DRAKE_DAILIES: DailyAffirmation[] = [
  { text: 'Call the ones that still pick up. Protect the real ones today.',       source: 'Drake' },
  { text: 'Step into the room on your own terms. Everything you built is yours.', source: 'Drake' },
  { text: 'Put the wins on the shelf — then go earn another one.',                source: 'Drake' },
  { text: 'Keep the real ones close. Archive the noise.',                          source: 'Drake' },
  { text: 'Let the ones who stayed know they stayed for a reason.',               source: 'Drake' },
  { text: 'One more push. The view is earned, not given.',                        source: 'Drake' },
  { text: 'Answer the calls that matter. Silence the rest.',                      source: 'Drake' },
  { text: 'The energy you bring in is the energy the room carries.',              source: 'Drake' },
  { text: 'Move like the opportunity is already yours — because it is.',          source: 'Drake' },
  { text: 'Clean out the phone, keep the real numbers.',                          source: 'Drake' },
  { text: 'Less reacting. More architecting.',                                    source: 'Drake' },
  { text: 'The quiet seasons are where the empire gets built.',                   source: 'Drake' },
  { text: 'Run the day. Don\'t let the day run you.',                             source: 'Drake' },
  { text: 'Lock in. One focused block beats a scattered afternoon.',              source: 'Drake' },
  { text: 'Build the kind of day your future self would sign off on.',            source: 'Drake' },
  { text: 'You\'ve been on. Stay on.',                                            source: 'Drake' },
  { text: 'Count the wins quietly. Let the work make the noise.',                 source: 'Drake' },
  { text: 'Set the tone in the first hour. The rest follows.',                    source: 'Drake' },
  { text: 'Every answered message is a seed. Plant carefully.',                   source: 'Drake' },
  { text: 'Momentum is a choice. Choose it before noon.',                         source: 'Drake' },
  { text: 'Keep the list short. Make the list matter.',                           source: 'Drake' },
  { text: 'Small, steady, non-stop. That\'s the whole playbook.',                 source: 'Drake' },
  { text: 'The team is only as sharp as the captain is calm.',                    source: 'Drake' },
  { text: 'Protect the hours nobody sees. That\'s where the edge lives.',         source: 'Drake' },
  { text: 'Give the real ones their flowers while the work is still wet.',        source: 'Drake' },
  { text: 'Rest is strategy. Schedule it like a meeting.',                        source: 'Drake' },
  { text: 'You don\'t need the spotlight — you are the source.',                  source: 'Drake' },
  { text: 'Finish what you opened. Close the loops.',                             source: 'Drake' },
  { text: 'Show up for the version of you that\'s already winning.',              source: 'Drake' },
  { text: 'The numbers follow the habits. Tend the habits.',                      source: 'Drake' },
];

function getDailyAffirmation(): DailyAffirmation {
  const now = new Date();
  // Offset by day AND week so adjacent days never share an affirmation
  const dayOfYear = Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const week = Math.floor(dayOfYear / 7);
  const idx = (dayOfYear * 7 + week * 3) % DRAKE_DAILIES.length;
  return DRAKE_DAILIES[idx];
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
  // Include active (IN_PROGRESS) tasks first so "Start Working" moves them into the timeline
  const tasksForTimeline = [...tasks.active, ...tasks.today]
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

export async function mutateTaskFromAction(taskId: string, action: 'start' | 'defer' | 'complete' | 'unblock' | 'vision_board') {
  if (action === 'vision_board') {
    if (isTaskPoolRepositorySource()) {
      await addVisionBoardLabelToIssue(taskId);
    }
    // No-op for DB mode (no label system)
    return;
  }
  if (action === 'start') {
    await updateTask({ id: taskId, status: TaskStatus.IN_PROGRESS });
  } else if (action === 'defer') {
    await updateTask({ id: taskId, status: TaskStatus.TODO });
  } else if (action === 'complete') {
    // Route through updateTask so task-pool (GitHub Issues) and DB modes both work.
    // In DB mode we additionally stamp completedAt so the trophy window query matches.
    await updateTask({ id: taskId, status: TaskStatus.DONE });
    if (!isTaskPoolRepositorySource()) {
      try {
        await prisma.task.update({ where: { id: taskId }, data: { completedAt: new Date() } });
      } catch {
        // updateTask already succeeded; stamping completedAt is best-effort.
      }
    }
  } else if (action === 'unblock') {
    await updateTask({ id: taskId, status: TaskStatus.IN_PROGRESS });
  }
}


// ---------------------------------------------------------------------------
// Draft store accessors — used by the ruby-custom send route
// ---------------------------------------------------------------------------

/** Fast synchronous lookup — hits memory only. */
export function getRubyDraft(emailId: string): V2EmailDraft | undefined {
  return rubyDraftStore.get(emailId);
}

/**
 * Async lookup with DB fallback — use this in send routes so drafts survive
 * serverless cold starts where the in-memory Map is empty.
 */
export async function getRubyDraftWithFallback(emailId: string): Promise<V2EmailDraft | undefined> {
  const mem = rubyDraftStore.get(emailId);
  if (mem) return mem;

  try {
    const record = await prisma.emailDraftSuggestion.findFirst({
      where: { emailExternalId: emailId, source: 'ruby_custom', approvedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) return undefined;
    const draft: V2EmailDraft = {
      id: `${emailId}-ruby-custom`,
      tone: 'Ruby Custom',
      body: record.body,
      approveWebhook: `/api/v2/email/send/${emailId}/ruby-custom`,
      source: 'ruby_custom',
    };
    rubyDraftStore.set(emailId, draft); // restore for fast subsequent access
    return draft;
  } catch {
    return undefined;
  }
}

export async function markDraftSent(emailId: string, draftId?: string): Promise<void> {
  // Track sent draft with optional draftId for granular tracking
  // Composite key format: "emailId" or "emailId:draftId"
  const sentKey = draftId ? `${emailId}:${draftId}` : emailId;
  sentDrafts.add(sentKey);

  // Always clear Ruby draft store for this email (backward compatible behavior)
  rubyDraftStore.delete(emailId);
  pendingRubyDrafts.delete(emailId);

  try {
    await prisma.emailDraftSuggestion.updateMany({
      where: { emailExternalId: emailId, approvedAt: null },
      data: { approvedAt: new Date() },
    });
  } catch { /* best-effort */ }
}

// ---------------------------------------------------------------------------
// Vision Board Feed
// ---------------------------------------------------------------------------
export async function getV2VisionBoardFeed(): Promise<V2VisionBoardFeed> {
  const board = await getOrCreateVisionBoard();
  const pillars = await listVisionPillars(board.id);

  // Collect all linked IDs in one pass
  const allCampaignIds = [
    ...new Set(
      pillars.flatMap((p) =>
        p.items.flatMap((i) => i.campaignLinks.map((l) => l.campaignId))
      )
    ),
  ];
  const allPlanIds = [
    ...new Set(
      pillars.flatMap((p) =>
        p.items.flatMap((i) => i.financePlanLinks.map((l) => l.financePlanId))
      )
    ),
  ];
  const allTaskIds = [
    ...new Set(
      pillars.flatMap((p) =>
        p.items.flatMap((i) => i.taskLinks.map((l) => l.taskId))
      )
    ),
  ];

  // Batch fetch campaigns, plans, dispatch task counts, and linked tasks
  const [campaigns, plans, taskGroupCounts, linkedTaskRecords] = await Promise.all([
    allCampaignIds.length
      ? prisma.dispatchCampaign.findMany({ where: { id: { in: allCampaignIds } } })
      : Promise.resolve([]),
    allPlanIds.length
      ? prisma.financePlan.findMany({ where: { id: { in: allPlanIds } } })
      : Promise.resolve([]),
    allCampaignIds.length
      ? prisma.dispatchTask.groupBy({
          by: ['campaignId'],
          where: { campaignId: { in: allCampaignIds } },
          _count: { id: true },
        })
      : Promise.resolve([]),
    allTaskIds.length
      ? listTasks().then(all => (all as any[]).filter(t => allTaskIds.includes(String(t.id))))
      : Promise.resolve([]),
  ]);

  const doneTaskCounts = allCampaignIds.length
    ? await prisma.dispatchTask.groupBy({
        by: ['campaignId'],
        where: { campaignId: { in: allCampaignIds }, status: 'DONE' },
        _count: { id: true },
      })
    : [];

  // Build lookup maps
  const campaignMap = new Map(campaigns.map((c) => [c.id, c]));
  const taskMap = new Map(linkedTaskRecords.map((t) => [t.id, t]));
  const planMap = new Map(plans.map((p) => [p.id, p]));
  const totalTaskMap = new Map(taskGroupCounts.map((g) => [g.campaignId, g._count.id]));
  const doneTaskMap = new Map(doneTaskCounts.map((g) => [g.campaignId, g._count.id]));

  function campaignProgress(campaignId: string): number {
    const campaign = campaignMap.get(campaignId);
    if (!campaign) return 0;
    if (campaign.status === 'COMPLETED') return 100;
    const total = totalTaskMap.get(campaignId) ?? 0;
    if (total === 0) return 0;
    const done = doneTaskMap.get(campaignId) ?? 0;
    return Math.round((done / total) * 100);
  }

  function planProgress(planId: string): number | null {
    const plan = planMap.get(planId);
    if (!plan) return null;
    if (plan.currentValue == null || plan.targetValue == null || plan.targetValue === 0)
      return null;
    return Math.min(100, Math.round((plan.currentValue / plan.targetValue) * 100));
  }

  function itemOverallProgress(
    linkedCampaigns: V2VisionLinkedCampaign[],
    linkedPlans: V2VisionLinkedFinancePlan[],
    linkedTasks: V2VisionLinkedTask[]
  ): number {
    const all: number[] = [
      ...linkedCampaigns.map((c) => c.progressPercent),
      ...linkedPlans.map((p) => p.progressPercent ?? 0),
    ];
    if (linkedTasks.length > 0) {
      const doneCount = linkedTasks.filter((t) => t.status === 'Done').length;
      all.push(Math.round((doneCount / linkedTasks.length) * 100));
    }
    if (all.length === 0) return 0;
    return Math.round(all.reduce((a, b) => a + b, 0) / all.length);
  }

  // Map pillars to feed shape
  const mappedPillars: V2VisionPillar[] = pillars.map((pillar) => {
    const items: V2VisionItem[] = pillar.items.map((item) => {
      const linkedCampaigns: V2VisionLinkedCampaign[] = item.campaignLinks
        .flatMap((link) => {
          const c = campaignMap.get(link.campaignId);
          if (!c) return [];
          return [{
            id: c.id,
            title: c.title,
            status: c.status as string,
            progressPercent: campaignProgress(c.id),
            taskCount: totalTaskMap.get(c.id) ?? 0,
          }];
        });

      const linkedFinancePlans: V2VisionLinkedFinancePlan[] = item.financePlanLinks
        .flatMap((link) => {
          const p = planMap.get(link.financePlanId);
          if (!p) return [];
          return [{
            id: p.id,
            title: p.title,
            type: p.type as string,
            status: p.status as string,
            progressPercent: planProgress(p.id),
            targetDate: p.targetDate ? p.targetDate.toISOString() : null,
          }];
        });

      const linkedTasks: V2VisionLinkedTask[] = item.taskLinks.flatMap((link) => {
        const t = taskMap.get(link.taskId);
        if (!t) return [];
        return [{
          id: t.id,
          title: t.title,
          status: mapTaskStatus(t.status as TaskStatus),
          priority: mapTaskPriority((t.priority as TaskPriority) || TaskPriority.MEDIUM),
          dueAt: t.dueAt ? t.dueAt.toISOString() : null,
          assignedBot: botNameForRoute(routeForTask(t)),
        }];
      });

      const overallProgressPercent = itemOverallProgress(linkedCampaigns, linkedFinancePlans, linkedTasks);

      return {
        id: item.id,
        title: item.title,
        description: item.description,
        status: item.status,
        targetDate: item.targetDate ? item.targetDate.toISOString() : null,
        imageEmoji: item.imageEmoji,
        imageUrl: item.imageUrl ?? null,
        notes: item.notes,
        sortOrder: item.sortOrder,
        linkedCampaigns,
        linkedFinancePlans,
        linkedTasks,
        overallProgressPercent,
        emeraldSuggestions: [], // populated on-demand via SSE
      };
    });

    return {
      id: pillar.id,
      label: pillar.label,
      emoji: pillar.emoji,
      color: pillar.color,
      sortOrder: pillar.sortOrder,
      items,
      itemCount: items.length,
      activeCount: items.filter((i) => i.status === 'ACTIVE').length,
      achievedCount: items.filter((i) => i.status === 'ACHIEVED').length,
    };
  });

  // Summary counts
  const allItems = mappedPillars.flatMap((p) => p.items);
  const summary = {
    totalItems: allItems.length,
    activeItems: allItems.filter((i) => i.status === 'ACTIVE').length,
    achievedItems: allItems.filter((i) => i.status === 'ACHIEVED').length,
    dreamingItems: allItems.filter((i) => i.status === 'DREAMING').length,
    totalLinkedCampaigns: allCampaignIds.length,
    totalLinkedPlans: allPlanIds.length,
  };

  return {
    boardId: board.id,
    title: board.title,
    pillars: mappedPillars,
    summary,
    generatedAt: new Date().toISOString(),
  };
}
