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
  title: string;
  iconType: 'check' | 'clock' | 'alert' | 'spark';
  status: 'done' | 'current' | 'upcoming';
};

export type V2DashboardPriorityItem = {
  id: string;
  title: string;
  source: string;
  actionWebhook: string;
  assignedBot: string;
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
  };
  timeline: V2DashboardTimelineItem[];
  topPriorities: V2DashboardPriorityItem[];
  liveBotActivity: V2DashboardBotActivity[];
  systemHealth: SystemHealthSnapshot;
  pendingApprovals: V2PendingApprovalSummary[];
};

export type V2TaskItem = {
  taskId: string;
  status: 'Active' | 'Queued' | 'Blocked' | 'Done';
  title: string;
  metadata: {
    timeframe: string;
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
  updatedAt: string;
};

export type V2FinanceOverviewFeed = {
  accounts: Array<{
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

