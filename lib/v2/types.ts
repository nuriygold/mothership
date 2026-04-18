export type V2ErrorResponse = {
  error: {
    code: string;
    message: string;
  };
};

export type SystemHealthSnapshot = {
  primarySystems: number;
  botPerformance: number;
  emailProcessing: number;
  dataSync: number;
};

export type BotRouteKey = 'adrian' | 'ruby' | 'emerald' | 'adobe' | 'anchor' | 'gateway';

export type V2BotStatus = 'active' | 'done' | 'pending' | 'working' | 'idle' | 'blocked';

export type V2DashboardTimelineItem = {
  time: string;
  endTime?: string | null;
  title: string;
  iconType: 'check' | 'clock' | 'alert' | 'spark' | 'focus';
  status: 'done' | 'current' | 'upcoming';
  type: 'calendar' | 'task' | 'focus-block';
  taskId?: string;
  meetingUrl?: string | null;
  startDate?: string; // ISO for sorting + now-line positioning
  endDate?: string | null;
  assignedBot?: string;
  isDraggable?: boolean;
};

export type V2DashboardPriorityItem = {
  id: string;
  taskId?: string;
  title: string;
  source: string;
  actionWebhook: string;
  assignedBot: string;
  dueAt?: string | null;
  /** Task workflow state — used by TakeActionModal to show only relevant actions */
  taskStatus?: 'Active' | 'Queued' | 'Blocked' | 'Done';
};

export type V2DashboardBotActivity = {
  botName: string;
  currentTask: string;
  status: 'active' | 'done' | 'pending';
};

export type V2PendingApprovalSummary = {
  count: number;
  description: string;
  category: 'email' | 'finance' | 'tasks' | 'other';
};

export type V2TodayFeed = {
  userContext: {
    userName: string;
    greeting: string;
    affirmation: string;
  };
  timeline: V2DashboardTimelineItem[];
  topPriorities: V2DashboardPriorityItem[];
  liveBotActivity: V2DashboardBotActivity[];
  systemHealth: SystemHealthSnapshot | null;
  pendingApprovals: V2PendingApprovalSummary[];
};

export type V2TaskItem = {
  taskId: string;
  status: 'Active' | 'Queued' | 'Blocked' | 'Done';
  title: string;
  visionItemId?: string | null;
  /** True when the GitHub issue has the `domain: vision board` label */
  visionBoardLinked?: boolean;
  metadata: {
    timeframe: string;
    dueAtISO: string | null; // raw ISO for sorting; null when no due date
    department: string;
    assignedBot: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    source: string;
  };
  actions: Array<{
    label: 'Start' | 'Defer' | 'Complete' | 'Unblock';
    endpoint: string;
    method: 'PATCH' | 'POST';
  }>;
};

export type V2TasksFeed = {
  counters: {
    tracked: number;
    active: number;
    blocked: number;
    queued: number;
  };
  active: V2TaskItem[];
  today: V2TaskItem[];
  backlog: V2TaskItem[];
};

export type V2BotProfile = {
  identity: {
    name: string;
    role: string;
    colorKey: 'mint' | 'pink' | 'sky' | 'lemon' | 'lavender';
    iconKey: 'trending-up' | 'mail' | 'search' | 'file-text' | 'anchor';
  };
  liveState: {
    currentTask: string;
    status: V2BotStatus;
  };
  throughputMetrics: {
    completed: number;
    queued: number;
    blocked: number;
  };
  recentOutputs: Array<{
    title: string;
    timestamp: string;
    type: string;
  }>;
  staticProfile: {
    workingStyle: string;
    personality: string;
    strengths: string[];
  };
};

export type V2BotsFeed = {
  bots: V2BotProfile[];
};

export type V2EmailItem = {
  id: string;
  sender: string;
  subject: string;
  preview: string;
  snippet?: string;
  gmailLink?: string;
  timestamp: string;
  isRead: boolean;
  sourceIntegration: 'Gmail' | 'Zoho' | 'Internal';
};

export type V2EmailFeed = {
  inbox: V2EmailItem[];
};

export type V2EmailDraft = {
  id: string;
  tone: 'Enthusiastic' | 'Measured' | 'Decline' | 'Ruby Custom';
  body: string;
  approveWebhook: string;
  source: 'template' | 'ruby_custom';
};

export type V2EmailDraftFeed = {
  emailId: string;
  drafts: V2EmailDraft[];
  streamId: string;
};

export type V2FinancePlanMilestone = {
  label: string;
  targetValue?: number;
  completedAt?: string;
};

export type V2FinancePlan = {
  id: string;
  title: string;
  type: 'CREDIT_SCORE' | 'BUDGET' | 'SAVINGS' | 'DEBT_PAYOFF' | 'INVESTMENT' | 'EXPENSE_REDUCTION' | 'CUSTOM';
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
  description: string | null;
  goal: string | null;
  currentValue: number | null;
  targetValue: number | null;
  unit: string | null;
  startDate: string | null;
  targetDate: string | null;
  managedByBot: string;
  milestones: V2FinancePlanMilestone[];
  progressPercent: number | null;
  notes: string | null;
  updatedAt: string | null;
  visionItemTitle?: string | null;
};

export type V2FinanceEvent = {
  id: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high' | 'critical';
  resolved: boolean;
  createdAt: string;
};

export type V2FinanceOverviewFeed = {
  accounts: Array<{
    id: string;
    name: string;
    type: string;
    balance: number;
    trendPercentage: string;
  }>;
  payables: Array<{
    vendor: string;
    amount: number;
    dueDate: string;
    status: 'pending' | 'paid' | 'overdue';
  }>;
  transactions: Array<{
    date: string;
    description: string;
    category: string;
    amount: number;
    handledByBot: string;
  }>;
  plans: V2FinancePlan[];
  events: V2FinanceEvent[];
  merchants: {
    total: number;
    uncategorized: number;
    pendingCategorization: Array<{
      id: string;
      merchantName: string;
      transactionCount: number;
      lastSeen: string;
    }>;
  };
  budget: Array<{
    id: string;
    name: string;
    monthlyTarget: number;
    emoji: string | null;
    spent: number;
    remaining: number;
    percentUsed: number;
    status: 'green' | 'yellow' | 'red';
  }>;
  forecast: V2CashFlowForecast | null;
  subscriptions: V2Subscription[];
  incomeSources: V2IncomeSource[];
  netWorthHistory: V2NetWorthPoint[];
  healthScore: V2HealthScore | null;
  generatedAt: string;                            // ISO timestamp — when this payload was assembled
  systemStatus: 'ok' | 'partial';                // 'partial' if any module threw during assembly
};

export type V2Subscription = {
  id: string;
  merchant: string;
  amount: number;
  interval: string;
  monthlyEquivalent: number;
  nextChargeDate: string | null;
  category: string | null;
};

export type V2IncomeSource = {
  id: string;
  source: string;
  amount: number;
  interval: string;
  nextPayday: string | null;
  lastSeen: string;
  confirmed: boolean;
};

export type V2NetWorthPoint = {
  date: string;
  assets: number;
  liabilities: number;
  netWorth: number;
};

export type V2HealthScoreBreakdown = {
  liquidityBuffer: number;
  budgetCompliance: number;
  subscriptionBurden: number;
  forecastRisk: number;
  anomalyLoad: number;
};

export type V2HealthScore = {
  score: number;
  message: string;
  breakdown: V2HealthScoreBreakdown;
};

export type V2ForecastOutflow = {
  label: string;
  amount: number;
  type: 'payable' | 'subscription';
};

export type V2ForecastDay = {
  date: string;
  projectedBalance: number;
  scheduledOutflows: V2ForecastOutflow[];
  projectedIncome: number;
  estimatedSpend: number;
  isLowBalanceAlert: boolean;
};

export type V2PaydaySchedule = {
  source: string;
  amount: number;
  intervalLabel: string;
  intervalDays: number;
  nextDate: string;
};

export type V2ForecastConfidence = {
  score: number;
  label: string;
  factors: string[];
};

export type V2CashFlowForecast = {
  generatedAt: string;
  openingBalance: number;
  liquidAccountsOnly: boolean;
  days: V2ForecastDay[];
  lowestPoint: { date: string; balance: number };
  paydaySchedules: V2PaydaySchedule[];
  alerts: string[];
  confidence: V2ForecastConfidence;
};

export type V2ActivityItem = {
  id: string;
  timestamp: string;
  eventType: string;
  description: string;
  actor: string;
  sourceIntegration: string;
};

export type V2ActivityFeed = {
  events: V2ActivityItem[];
  page: number;
  pageSize: number;
  hasMore: boolean;
};

// ─── Vision Board ──────────────────────────────────────────────────────────────

export type VisionPillarColor = 'MINT' | 'LAVENDER' | 'PEACH' | 'SKY' | 'PINK' | 'LEMON';
export type VisionItemStatus = 'DREAMING' | 'ACTIVE' | 'ACHIEVED' | 'ON_HOLD';

export type V2VisionLinkedCampaign = {
  id: string;
  title: string;
  status: string;
  progressPercent: number;
  taskCount: number;
};

export type V2VisionLinkedFinancePlan = {
  id: string;
  title: string;
  type: string;
  status: string;
  progressPercent: number | null;
  targetDate: string | null;
};

export type V2VisionLinkedTask = {
  id: string;
  title: string;
  status: 'Active' | 'Queued' | 'Blocked' | 'Done';
  priority: 'low' | 'medium' | 'high' | 'critical';
  dueAt: string | null;
  assignedBot: string;
};

export type V2VisionEmeraldSuggestion = {
  id: string;
  text: string;
  actionType: 'campaign' | 'finance_plan' | 'task' | 'note';
};

export type V2VisionItem = {
  id: string;
  title: string;
  description: string | null;
  status: VisionItemStatus;
  targetDate: string | null;
  imageEmoji: string | null;
  imageUrl: string | null;
  notes: string | null;
  sortOrder: number;
  linkedCampaigns: V2VisionLinkedCampaign[];
  linkedFinancePlans: V2VisionLinkedFinancePlan[];
  linkedTasks: V2VisionLinkedTask[];
  overallProgressPercent: number;
  emeraldSuggestions: V2VisionEmeraldSuggestion[];
};

export type V2VisionPillar = {
  id: string;
  label: string;
  emoji: string | null;
  color: VisionPillarColor;
  sortOrder: number;
  items: V2VisionItem[];
  itemCount: number;
  activeCount: number;
  achievedCount: number;
};

// ─── Email Agent Triage ────────────────────────────────────────────────────────

export type EmailTriageBucket =
  | 'ACT_SOON'
  | 'NEED_HUMAN_EYES'
  | 'BILLS'
  | 'RELATIONSHIP_KEEPER'
  | 'PERSONAL'
  | 'UPCOMING_EVENT'
  | 'OPPORTUNITY_PILE'
  | 'MARKETING'
  | 'NOT_YOUR_SPEED'
  | 'OTHER';

export type EmailTriageConfidence = 'LOCKED_IN' | 'PRETTY_SURE' | 'NEEDS_YOUR_EYES';
export type EmailTriageStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXECUTED';

export type V2EmailTriageSummary = {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  sourceIntegration?: 'Gmail' | 'Zoho' | 'Internal';
};

export type V2EmailTriageItem = {
  id: string;
  bucket: EmailTriageBucket;
  status: EmailTriageStatus;
  agentName: string;
  recommendation: string;
  actionLabel: string;
  emailSummaries: V2EmailTriageSummary[];
  urgentCount?: number;
  confidence?: EmailTriageConfidence;
  subGroups?: { SEND: string[]; REVIEW: string[]; SKIP: string[] };
  createdAt: string;
};

export type V2EmailTriageFeed = {
  triages: V2EmailTriageItem[];
  lastRunAt: string | null;
};

export type V2VisionBoardFeed = {
  boardId: string;
  title: string;
  pillars: V2VisionPillar[];
  summary: {
    totalItems: number;
    activeItems: number;
    achievedItems: number;
    dreamingItems: number;
    totalLinkedCampaigns: number;
    totalLinkedPlans: number;
  };
  generatedAt: string;
};
