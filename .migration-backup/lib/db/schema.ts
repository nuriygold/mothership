import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { JsonValue } from './json';

// Re-export the canonical Dispatch / Mission Control schema so consumers can
// continue to import everything from a single entry point. New code should
// prefer the `mc*` exports for the generic agent-orchestration data model.
export * from './dispatch-schema';

// Transitional Drizzle schema. Expand this file while migrating each Prisma model.
export const users = pgTable('User', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const notifications = pgTable('Notification', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body'),
  href: text('href'),
  read: boolean('read').default(false).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  readCreatedAtIdx: index('Notification_read_createdAt_idx').on(table.read, table.createdAt),
}));

export const tasks = pgTable('Task', {
  id: text('id').primaryKey(),
  workflowId: text('workflowId'),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('TODO').notNull(),
  priority: text('priority').default('MEDIUM').notNull(),
  ownerId: text('ownerId'),
  assignee: text('assignee'),
  dueAt: timestamp('dueAt', { withTimezone: true }),
  visionItemId: text('visionItemId'),
  completedAt: timestamp('completedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
}, (table) => ({
  completedAtIdx: index('Task_completedAt_idx').on(table.completedAt),
}));

export const workflows = pgTable('Workflow', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').default('STANDARD').notNull(),
  status: text('status').default('ACTIVE').notNull(),
  ownerId: text('ownerId').notNull(),
  currentSchemaVersionId: text('currentSchemaVersionId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const workflowSchemaVersions = pgTable('WorkflowSchemaVersion', {
  id: text('id').primaryKey(),
  workflowId: text('workflowId').notNull(),
  version: integer('version').notNull(),
  schemaJson: jsonb('schemaJson').$type<JsonValue>().notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  workflowVersionIdx: uniqueIndex('WorkflowSchemaVersion_workflowId_version_key').on(table.workflowId, table.version),
}));

export const submissions = pgTable('Submission', {
  id: text('id').primaryKey(),
  workflowId: text('workflowId').notNull(),
  submittedById: text('submittedById'),
  sourceChannel: text('sourceChannel').notNull(),
  fileName: text('fileName'),
  rawPayload: jsonb('rawPayload').$type<JsonValue>().notNull(),
  normalizedPayload: jsonb('normalizedPayload').$type<JsonValue>(),
  validationStatus: text('validationStatus').default('PENDING').notNull(),
  validationSummary: jsonb('validationSummary').$type<JsonValue>(),
  submittedAt: timestamp('submittedAt', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processedAt', { withTimezone: true }),
}, (table) => ({
  workflowSubmittedAtIdx: index('Submission_workflowId_submittedAt_idx').on(table.workflowId, table.submittedAt),
}));

export const auditEvents = pgTable('AuditEvent', {
  id: text('id').primaryKey(),
  entityType: text('entityType').notNull(),
  entityId: text('entityId').notNull(),
  eventType: text('eventType').notNull(),
  actorId: text('actorId'),
  metadata: jsonb('metadata').$type<JsonValue>(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});

export const runs = pgTable('Run', {
  id: text('id').primaryKey(),
  workflowId: text('workflowId'),
  taskId: text('taskId').unique(),
  type: text('type').notNull(),
  sourceSystem: text('sourceSystem').notNull(),
  status: text('status').default('QUEUED').notNull(),
  startedAt: timestamp('startedAt', { withTimezone: true }),
  completedAt: timestamp('completedAt', { withTimezone: true }),
  metadata: jsonb('metadata').$type<JsonValue>(),
  errorMessage: text('errorMessage'),
  submissionId: text('submissionId'),
}, (table) => ({
  startedAtIdx: index('Run_startedAt_idx').on(table.startedAt),
}));

export const approvals = pgTable('Approval', {
  id: text('id').primaryKey(),
  workflowId: text('workflowId'),
  taskId: text('taskId'),
  requestedById: text('requestedById'),
  decidedById: text('decidedById'),
  status: text('status').default('REQUESTED').notNull(),
  reason: text('reason'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp('decidedAt', { withTimezone: true }),
}, (table) => ({
  workflowCreatedAtIdx: index('Approval_workflowId_createdAt_idx').on(table.workflowId, table.createdAt),
}));

export const connectors = pgTable('Connector', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  status: text('status').default('DISCONNECTED').notNull(),
  config: jsonb('config').$type<JsonValue>(),
  workflowId: text('workflowId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const commands = pgTable('Command', {
  id: text('id').primaryKey(),
  input: text('input').notNull(),
  sourceChannel: text('sourceChannel').notNull(),
  requestedById: text('requestedById'),
  status: text('status').default('RECEIVED').notNull(),
  runId: text('runId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completedAt', { withTimezone: true }),
}, (table) => ({
  runCreatedAtIdx: index('Command_runId_createdAt_idx').on(table.runId, table.createdAt),
}));

export const visionBoards = pgTable('VisionBoard', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').default('My Vision').notNull(),
  description: text('description'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

export const visionPillars = pgTable('VisionPillar', {
  id: uuid('id').defaultRandom().primaryKey(),
  boardId: uuid('boardId').notNull(),
  label: text('label').notNull(),
  emoji: text('emoji'),
  color: text('color').default('LAVENDER').notNull(),
  sortOrder: integer('sortOrder').default(0).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  boardSortIdx: index('VisionPillar_boardId_sortOrder_idx').on(table.boardId, table.sortOrder),
}));

export const visionItems = pgTable('VisionItem', {
  id: uuid('id').defaultRandom().primaryKey(),
  pillarId: uuid('pillarId').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('DREAMING').notNull(),
  targetDate: timestamp('targetDate', { withTimezone: true }),
  imageEmoji: text('imageEmoji'),
  imageUrl: text('imageUrl'),
  notes: text('notes'),
  sortOrder: integer('sortOrder').default(0).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  pillarSortIdx: index('VisionItem_pillarId_sortOrder_idx').on(table.pillarId, table.sortOrder),
}));

export const visionCampaignLinks = pgTable('VisionCampaignLink', {
  id: uuid('id').defaultRandom().primaryKey(),
  visionItemId: uuid('visionItemId').notNull(),
  campaignId: uuid('campaignId').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  itemCampaignIdx: uniqueIndex('VisionCampaignLink_visionItemId_campaignId_key').on(table.visionItemId, table.campaignId),
  campaignIdx: index('VisionCampaignLink_campaignId_idx').on(table.campaignId),
}));

export const visionFinancePlanLinks = pgTable('VisionFinancePlanLink', {
  id: uuid('id').defaultRandom().primaryKey(),
  visionItemId: uuid('visionItemId').notNull(),
  financePlanId: uuid('financePlanId').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  itemFinancePlanIdx: uniqueIndex('VisionFinancePlanLink_visionItemId_financePlanId_key').on(table.visionItemId, table.financePlanId),
  financePlanIdx: index('VisionFinancePlanLink_financePlanId_idx').on(table.financePlanId),
}));

export const visionTaskLinks = pgTable('VisionTaskLink', {
  id: uuid('id').defaultRandom().primaryKey(),
  visionItemId: uuid('visionItemId').notNull(),
  taskId: uuid('taskId').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  itemTaskIdx: uniqueIndex('VisionTaskLink_visionItemId_taskId_key').on(table.visionItemId, table.taskId),
  taskIdx: index('VisionTaskLink_taskId_idx').on(table.taskId),
}));

export const dispatchCampaigns = pgTable('DispatchCampaign', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('DRAFT').notNull(),
  costBudgetCents: integer('costBudgetCents'),
  timeBudgetSeconds: integer('timeBudgetSeconds'),
  callbackUrl: text('callbackUrl'),
  callbackSecret: text('callbackSecret'),
  latestPlan: jsonb('latestPlan').$type<JsonValue>(),
  latestPlanCreatedAt: timestamp('latestPlanCreatedAt', { withTimezone: true }),
  approvedPlanName: text('approvedPlanName'),
  approvedPlanAt: timestamp('approvedPlanAt', { withTimezone: true }),
  visionItemId: text('visionItemId'),
  projectId: text('projectId'),
  outputFolder: text('outputFolder'),
  assignedBotId: text('assignedBotId'),
  revenueStream: text('revenueStream'),
  linkedTaskRef: text('linkedTaskRef'),
  queuedAt: timestamp('queuedAt', { withTimezone: true }),
  scheduledAt: timestamp('scheduledAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const dispatchTasks = pgTable('DispatchTask', {
  id: text('id').primaryKey(),
  campaignId: text('campaignId').notNull(),
  title: text('title').notNull(),
  key: text('key'),
  description: text('description'),
  priority: integer('priority').default(5).notNull(),
  dependencies: jsonb('dependencies').$type<JsonValue>(),
  toolRequirements: jsonb('toolRequirements').$type<JsonValue>(),
  status: text('status').default('PLANNED').notNull(),
  agentId: text('agentId'),
  output: text('output'),
  reviewOutput: text('reviewOutput'),
  errorMessage: text('errorMessage'),
  toolTurns: integer('toolTurns'),
  taskPoolIssueNumber: integer('taskPoolIssueNumber'),
  taskPoolIssueUrl: text('taskPoolIssueUrl'),
  startedAt: timestamp('startedAt', { withTimezone: true }),
  completedAt: timestamp('completedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
}, (table) => ({
  campaignStatusIdx: index('DispatchTask_campaignId_status_idx').on(table.campaignId, table.status),
}));

export const projects = pgTable('Project', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  color: text('color').default('lavender').notNull(),
  icon: text('icon').default('folder').notNull(),
  sortOrder: integer('sortOrder').default(0).notNull(),
  isDefault: boolean('isDefault').default(false).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sortOrderIdx: index('Project_sortOrder_idx').on(table.sortOrder),
}));

export const chatSessions = pgTable('ChatSession', {
  id: text('id').primaryKey(),
  title: text('title'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const chatMessages = pgTable('ChatMessage', {
  id: text('id').primaryKey(),
  sessionId: text('sessionId').notNull(),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sessionCreatedAtIdx: index('ChatMessage_sessionId_createdAt_idx').on(table.sessionId, table.createdAt),
}));

export const revenueStreamStatuses = pgTable('RevenueStreamStatus', {
  id: uuid('id').defaultRandom().primaryKey(),
  stream: text('stream').notNull().unique(),
  status: text('status').default('unknown').notNull(),
  note: text('note'),
  requestedAt: timestamp('requestedAt', { withTimezone: true }),
  lastReportAt: timestamp('lastReportAt', { withTimezone: true }),
  lastReport: text('lastReport'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  streamIdx: index('RevenueStreamStatus_stream_idx').on(table.stream),
}));

export const revenueStreamStatusLogs = pgTable('RevenueStreamStatusLog', {
  id: uuid('id').defaultRandom().primaryKey(),
  stream: text('stream').notNull(),
  status: text('status').notNull(),
  note: text('note'),
  action: text('action'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  streamCreatedAtIdx: index('RevenueStreamStatusLog_stream_createdAt_idx').on(table.stream, table.createdAt),
}));

export const financeEvents = pgTable('FinanceEvent', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  source: text('source').notNull(),
  payload: jsonb('payload').$type<JsonValue>().notNull(),
  priority: text('priority').default('normal').notNull(),
  resolved: boolean('resolved').default(false).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  resolvedCreatedAtIdx: index('FinanceEvent_resolved_createdAt_idx').on(table.resolved, table.createdAt),
}));

export const payables = pgTable('Payable', {
  id: uuid('id').defaultRandom().primaryKey(),
  vendor: text('vendor').notNull(),
  amount: doublePrecision('amount').notNull(),
  currency: text('currency').default('USD').notNull(),
  dueDate: timestamp('dueDate', { withTimezone: true }),
  status: text('status').default('pending').notNull(),
  description: text('description'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  statusDueIdx: index('Payable_status_dueDate_idx').on(table.status, table.dueDate),
}));

export const accounts = pgTable('Account', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  currency: text('currency').default('USD').notNull(),
  balance: doublePrecision('balance').default(0).notNull(),
  liquid: boolean('liquid').default(true).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const transactions = pgTable('Transaction', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  amount: doublePrecision('amount').notNull(),
  description: text('description'),
  category: text('category'),
  handledByBot: text('handledByBot').default('Emerald').notNull(),
  occurredAt: timestamp('occurredAt', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  accountIdx: index('Transaction_accountId_idx').on(table.accountId),
  occurredAtIdx: index('Transaction_occurredAt_idx').on(table.occurredAt),
}));

import { FinancePlanStatus, FinancePlanType } from './enums';

export const financePlans = pgTable('FinancePlan', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  type: text('type').$type<FinancePlanType>().default('CUSTOM').notNull(),
  status: text('status').$type<FinancePlanStatus>().default('ACTIVE').notNull(),
  description: text('description'),
  goal: text('goal'),
  currentValue: doublePrecision('currentValue'),
  targetValue: doublePrecision('targetValue'),
  unit: text('unit'),
  startDate: timestamp('startDate', { withTimezone: true }),
  targetDate: timestamp('targetDate', { withTimezone: true }),
  managedByBot: text('managedByBot').default('adrian').notNull(),
  milestones: jsonb('milestones').$type<JsonValue>(),
  notes: text('notes'),
  sourceFile: text('sourceFile'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const budgetCategories = pgTable('BudgetCategory', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  monthlyTarget: doublePrecision('monthlyTarget').notNull(),
  emoji: text('emoji'),
});

export const merchantProfiles = pgTable('MerchantProfile', {
  id: text('id').primaryKey(),
  merchantName: text('merchantName').notNull().unique(),
  defaultCategory: text('defaultCategory'),
  isSubscription: boolean('isSubscription').default(false).notNull(),
  billingInterval: text('billingInterval'),
  subscriptionConfirmed: boolean('subscriptionConfirmed').default(false).notNull(),
  transactionCount: integer('transactionCount').default(0).notNull(),
  lastSeen: timestamp('lastSeen', { withTimezone: true }).defaultNow().notNull(),
});

export const netWorthSnapshots = pgTable('NetWorthSnapshot', {
  id: text('id').primaryKey(),
  date: timestamp('date', { withTimezone: true }).notNull().unique(),
  assets: doublePrecision('assets').notNull(),
  liabilities: doublePrecision('liabilities').notNull(),
  netWorth: doublePrecision('netWorth').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});

export const incomeSources = pgTable('IncomeSource', {
  id: text('id').primaryKey(),
  source: text('source').notNull().unique(),
  amount: doublePrecision('amount').notNull(),
  interval: text('interval').notNull(),
  avgDays: integer('avgDays').notNull(),
  lastSeenDate: timestamp('lastSeenDate', { withTimezone: true }).notNull(),
  confirmed: boolean('confirmed').default(false).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});

export const emailDraftSuggestions = pgTable('EmailDraftSuggestion', {
  id: text('id').primaryKey(),
  emailExternalId: text('emailExternalId').notNull(),
  tone: text('tone').notNull(),
  body: text('body').notNull(),
  source: text('source').notNull(),
  approvedAt: timestamp('approvedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});

export const emailAgentTriages = pgTable('EmailAgentTriage', {
  id: text('id').primaryKey(),
  bucket: text('bucket').notNull(),
  status: text('status').default('PENDING').notNull(),
  emailIds: jsonb('emailIds').$type<JsonValue>().notNull(),
  emailSummaries: jsonb('emailSummaries').$type<JsonValue>().notNull(),
  agentName: text('agentName').notNull(),
  recommendation: text('recommendation').notNull(),
  actionLabel: text('actionLabel').notNull(),
  actionPayload: jsonb('actionPayload').$type<JsonValue>(),
  approvedAt: timestamp('approvedAt', { withTimezone: true }),
  deniedAt: timestamp('deniedAt', { withTimezone: true }),
  executedAt: timestamp('executedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
}, (table) => ({
  statusCreatedAtIdx: index('EmailAgentTriage_status_createdAt_idx').on(table.status, table.createdAt),
}));

export const shoppingItems = pgTable('ShoppingItem', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  notes: text('notes'),
  source: text('source'),
  emailId: text('emailId'),
  emailSubject: text('emailSubject'),
  completedAt: timestamp('completedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
}, (table) => ({
  completedAtIdx: index('ShoppingItem_completedAt_idx').on(table.completedAt),
}));

export const agentInboxItems = pgTable('AgentInboxItem', {
  id: text('id').primaryKey(),
  agentKey: text('agentKey').notNull(),
  note: text('note').notNull(),
  source: text('source').default('email').notNull(),
  bucket: text('bucket'),
  emailIds: jsonb('emailIds').$type<JsonValue>().default([]).notNull(),
  emailSummaries: jsonb('emailSummaries').$type<JsonValue>().default([]).notNull(),
  status: text('status').default('PENDING').notNull(),
  handledAt: timestamp('handledAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
}, (table) => ({
  agentStatusCreatedAtIdx: index('AgentInboxItem_agentKey_status_createdAt_idx').on(table.agentKey, table.status, table.createdAt),
}));

export const plaidItems = pgTable('PlaidItem', {
  id: text('id').primaryKey(),
  itemId: text('itemId').notNull().unique(),
  accessToken: text('accessToken').notNull(),
  institutionName: text('institutionName'),
  cursor: text('cursor'),
  status: text('status').default('good').notNull(),
  errorCode: text('errorCode'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull(),
});
