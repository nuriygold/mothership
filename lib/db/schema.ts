import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
