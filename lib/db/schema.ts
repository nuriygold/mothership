import { pgTable, text, timestamp, uuid, boolean } from 'drizzle-orm/pg-core';

// Transitional Drizzle schema. Expand this file while migrating each Prisma model.
export const users = pgTable('User', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = pgTable('Notification', {
  id: uuid('id').primaryKey(),
  userId: uuid('userId'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  read: boolean('read').default(false).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow().notNull(),
});
