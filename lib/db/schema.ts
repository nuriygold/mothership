import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { JsonValue } from '@/lib/db/json';

// Transitional Drizzle schema. Expand this file while migrating each Prisma model.
export const users = pgTable('User', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = pgTable('Notification', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: text('type').notNull(),
  userId: uuid('userId'),
  title: text('title').notNull(),
  body: text('body'),
  href: text('href'),
  read: boolean('read').default(false).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  readCreatedAtIdx: index('Notification_read_createdAt_idx').on(table.read, table.createdAt),
}));

export const tasks = pgTable('Task', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflowId'),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').default('TODO').notNull(),
  priority: text('priority').default('MEDIUM').notNull(),
  ownerId: uuid('ownerId'),
  assignee: text('assignee'),
  dueAt: timestamp('dueAt', { withTimezone: true }),
  visionItemId: uuid('visionItemId'),
  completedAt: timestamp('completedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  completedAtIdx: index('Task_completedAt_idx').on(table.completedAt),
}));

export const workflows = pgTable('Workflow', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').default('STANDARD').notNull(),
  status: text('status').default('ACTIVE').notNull(),
  ownerId: uuid('ownerId').notNull(),
  currentSchemaVersionId: uuid('currentSchemaVersionId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

export const workflowSchemaVersions = pgTable('WorkflowSchemaVersion', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflowId').notNull(),
  version: integer('version').notNull(),
  schemaJson: jsonb('schemaJson').$type<JsonValue>().notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  workflowVersionIdx: uniqueIndex('WorkflowSchemaVersion_workflowId_version_key').on(table.workflowId, table.version),
}));

export const submissions = pgTable('Submission', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflowId').notNull(),
  submittedById: uuid('submittedById'),
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
  id: uuid('id').defaultRandom().primaryKey(),
  entityType: text('entityType').notNull(),
  entityId: text('entityId').notNull(),
  eventType: text('eventType').notNull(),
  actorId: uuid('actorId'),
  metadata: jsonb('metadata').$type<JsonValue>(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});

export const runs = pgTable('Run', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflowId'),
  taskId: uuid('taskId').unique(),
  type: text('type').notNull(),
  sourceSystem: text('sourceSystem').notNull(),
  status: text('status').default('QUEUED').notNull(),
  startedAt: timestamp('startedAt', { withTimezone: true }),
  completedAt: timestamp('completedAt', { withTimezone: true }),
  metadata: jsonb('metadata').$type<JsonValue>(),
  errorMessage: text('errorMessage'),
  submissionId: uuid('submissionId'),
}, (table) => ({
  startedAtIdx: index('Run_startedAt_idx').on(table.startedAt),
}));

export const approvals = pgTable('Approval', {
  id: uuid('id').defaultRandom().primaryKey(),
  workflowId: uuid('workflowId'),
  taskId: uuid('taskId'),
  requestedById: uuid('requestedById'),
  decidedById: uuid('decidedById'),
  status: text('status').default('REQUESTED').notNull(),
  reason: text('reason'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  decidedAt: timestamp('decidedAt', { withTimezone: true }),
}, (table) => ({
  workflowCreatedAtIdx: index('Approval_workflowId_createdAt_idx').on(table.workflowId, table.createdAt),
}));

export const commands = pgTable('Command', {
  id: uuid('id').defaultRandom().primaryKey(),
  input: text('input').notNull(),
  sourceChannel: text('sourceChannel').notNull(),
  requestedById: uuid('requestedById'),
  status: text('status').default('RECEIVED').notNull(),
  runId: uuid('runId'),
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
  campaignIdx: index('VisionCampaignLink_campaignId_idx').on(table.campaignId),
}));

export const visionFinancePlanLinks = pgTable('VisionFinancePlanLink', {
  id: uuid('id').defaultRandom().primaryKey(),
  visionItemId: uuid('visionItemId').notNull(),
  financePlanId: uuid('financePlanId').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  financePlanIdx: index('VisionFinancePlanLink_financePlanId_idx').on(table.financePlanId),
}));

export const visionTaskLinks = pgTable('VisionTaskLink', {
  id: uuid('id').defaultRandom().primaryKey(),
  visionItemId: uuid('visionItemId').notNull(),
  taskId: uuid('taskId').notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  taskIdx: index('VisionTaskLink_taskId_idx').on(table.taskId),
}));

export const dispatchCampaigns = pgTable('DispatchCampaign', {
  id: uuid('id').defaultRandom().primaryKey(),
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
  visionItemId: uuid('visionItemId'),
  projectId: uuid('projectId'),
  outputFolder: text('outputFolder'),
  assignedBotId: text('assignedBotId'),
  revenueStream: text('revenueStream'),
  linkedTaskRef: text('linkedTaskRef'),
  queuedAt: timestamp('queuedAt', { withTimezone: true }),
  scheduledAt: timestamp('scheduledAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

export const dispatchTasks = pgTable('DispatchTask', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaignId: uuid('campaignId').notNull(),
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
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  campaignStatusIdx: index('DispatchTask_campaignId_status_idx').on(table.campaignId, table.status),
}));

export const projects = pgTable('Project', {
  id: uuid('id').defaultRandom().primaryKey(),
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
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

export const chatMessages = pgTable('ChatMessage', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('sessionId').notNull(),
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
