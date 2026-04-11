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

export type BotRouteKey = 'adrian' | 'ruby' | 'emerald' | 'adobe' | 'gateway';

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
    iconKey: 'trending-up' | 'mail' | 'search' | 'file-text';
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
