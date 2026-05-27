import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { TaskPriority, TaskStatus } from '@/lib/db/enums';
import { getStreamDefs, readSnapshot, streamDefByKey } from '@/lib/v2/revenue-streams-server';

const REVENUE_STATUS_VALUES = new Set(['idle', 'active', 'paused', 'needs-attention']);

function normalizeRevenueStatus(value: string | null | undefined): 'idle' | 'active' | 'paused' | 'needs-attention' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (REVENUE_STATUS_VALUES.has(normalized)) {
    return normalized as 'idle' | 'active' | 'paused' | 'needs-attention';
  }
  return 'idle';
}

function statusNoteForAction(action: 'run-report' | 'check-status' | 'ping' | 'assign') {
  switch (action) {
    case 'run-report':
      return 'Report requested.';
    case 'check-status':
      return 'Status check requested.';
    case 'ping':
      return 'Lead pinged.';
    case 'assign':
      return 'Task assigned.';
  }
}

export async function listNotifications(limit = 50) {
  const [notifications, unreadRows] = await Promise.all([
    db.select()
      .from(schema.notifications)
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit),
    db.select({ count: sql<number>`count(*)` })
      .from(schema.notifications)
      .where(eq(schema.notifications.read, false)),
  ]);

  return {
    notifications: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body ?? null,
      href: notification.href ?? null,
      read: notification.read,
      createdAt: notification.createdAt.toISOString(),
    })),
    unread: Number(unreadRows[0]?.count ?? 0),
  };
}

export async function markNotificationsRead(id?: string) {
  if (id) {
    await db
      .update(schema.notifications)
      .set({ read: true })
      .where(eq(schema.notifications.id, id));
    return { id };
  }

  await db
    .update(schema.notifications)
    .set({ read: true })
    .where(eq(schema.notifications.read, false));

  return { id: null };
}

export async function listRevenueStreamStatuses() {
  const [defs, statusRows] = await Promise.all([
    getStreamDefs(),
    db.select().from(schema.revenueStreamStatuses).orderBy(schema.revenueStreamStatuses.stream),
  ]);

  const statusMap = new Map(statusRows.map((row) => [row.stream, row]));
  const streams = await Promise.all(
    defs.map(async (def) => {
      const row = statusMap.get(def.key);
      const snapshot = await readSnapshot(def.folderName);
      return {
        id: row?.id ?? def.key,
        stream: def.key,
        key: def.key,
        displayName: def.displayName,
        leadBotKey: def.leadBotKey,
        leadDisplay: def.leadDisplay,
        status: normalizeRevenueStatus(row?.status ?? snapshot.status),
        note: row?.note ?? snapshot.note ?? null,
        requestedAt: row?.requestedAt?.toISOString() ?? null,
        lastReportAt: row?.lastReportAt?.toISOString() ?? null,
        lastReport: row?.lastReport ?? null,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
        mtd: snapshot.mtd,
        ytd: snapshot.ytd,
        snapshotUpdated: snapshot.updated,
      };
    }),
  );

  return { streams };
}

export async function getRevenueStreamActivity(stream: string) {
  const activity = await db.select()
    .from(schema.revenueStreamStatusLogs)
    .where(eq(schema.revenueStreamStatusLogs.stream, stream))
    .orderBy(desc(schema.revenueStreamStatusLogs.createdAt))
    .limit(25);

  return {
    stream,
    activity: activity.map((entry) => ({
      id: entry.id,
      stream: entry.stream,
      status: entry.status,
      note: entry.note ?? null,
      action: entry.action ?? null,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

export async function getRevenueStreamSop(stream: string) {
  const def = await streamDefByKey(stream);
  if (!def) return null;

  try {
    const [markdown, stat] = await Promise.all([
      fs.readFile(def.sopPath, 'utf8'),
      fs.stat(def.sopPath),
    ]);

    return {
      key: def.key,
      title: def.displayName,
      markdown,
      updatedAt: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}

export async function patchRevenueStreamStatus(input: {
  stream: string;
  status?: string;
  note?: string | null;
  requestedAt?: Date | null;
  lastReportAt?: Date | null;
  lastReport?: string | null;
  action?: string | null;
}) {
  const now = new Date();
  const [existing] = await db.select()
    .from(schema.revenueStreamStatuses)
    .where(eq(schema.revenueStreamStatuses.stream, input.stream))
    .limit(1);
  const normalizedStatus = input.status === undefined
    ? normalizeRevenueStatus(existing?.status)
    : normalizeRevenueStatus(input.status);

  const nextValues = {
    stream: input.stream,
    status: normalizedStatus,
    note: input.note === undefined ? existing?.note ?? null : input.note,
    requestedAt: input.requestedAt === undefined ? existing?.requestedAt ?? null : input.requestedAt,
    lastReportAt: input.lastReportAt === undefined ? existing?.lastReportAt ?? null : input.lastReportAt,
    lastReport: input.lastReport === undefined ? existing?.lastReport ?? null : input.lastReport,
    updatedAt: now,
  };

  if (existing) {
    await db.update(schema.revenueStreamStatuses)
      .set(nextValues)
      .where(eq(schema.revenueStreamStatuses.id, existing.id));
  } else {
    await db.insert(schema.revenueStreamStatuses).values({
      id: randomUUID(),
      createdAt: now,
      ...nextValues,
    });
  }

  await db.insert(schema.revenueStreamStatusLogs).values({
    id: randomUUID(),
    stream: input.stream,
    status: normalizedStatus,
    note: input.note ?? statusNoteForAction((input.action as 'run-report' | 'check-status' | 'ping' | 'assign') ?? 'ping'),
    action: input.action ?? null,
    createdAt: now,
  });

  return {
    stream: input.stream,
    status: normalizedStatus,
    note: nextValues.note,
    requestedAt: nextValues.requestedAt?.toISOString() ?? null,
    lastReportAt: nextValues.lastReportAt?.toISOString() ?? null,
    lastReport: nextValues.lastReport,
    updatedAt: now.toISOString(),
  };
}

export async function runRevenueStreamAction(stream: string, action: 'run-report' | 'check-status' | 'ping') {
  const now = new Date();
  if (action === 'run-report') {
    return patchRevenueStreamStatus({
      stream,
      lastReportAt: now,
      lastReport: `Report requested at ${now.toISOString()}.`,
      action,
    });
  }

  return patchRevenueStreamStatus({
    stream,
    requestedAt: now,
    action,
  });
}

export async function assignRevenueStreamTask(input: {
  stream: string;
  title: string;
  description?: string;
}) {
  const def = await streamDefByKey(input.stream);
  if (!def) {
    throw new Error(`Unknown revenue stream: ${input.stream}`);
  }

  const now = new Date();
  const [task] = await db.insert(schema.tasks).values({
    id: randomUUID(),
    title: input.title,
    description: input.description
      ? `[Revenue Stream: ${def.displayName}]\n${input.description}`
      : `[Revenue Stream: ${def.displayName}]`,
    assignee: def.leadBotKey,
    status: TaskStatus.TODO,
    priority: TaskPriority.MEDIUM,
    updatedAt: now,
  }).returning({
    id: schema.tasks.id,
    title: schema.tasks.title,
    assignee: schema.tasks.assignee,
  });

  await patchRevenueStreamStatus({
    stream: input.stream,
    action: 'assign',
    note: `Task assigned to ${def.leadDisplay}: ${input.title}`,
  });

  return {
    taskId: task.id,
    title: task.title,
    assignee: task.assignee,
  };
}

export async function requireRevenueStream(stream: string) {
  const def = await streamDefByKey(stream);
  if (!def) {
    throw new Error(`Unknown revenue stream: ${stream}`);
  }
  return def;
}
