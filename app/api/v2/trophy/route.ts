import { NextResponse } from 'next/server';
import { and, desc, eq, gte, isNull, isNotNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { auditEvents, commands, tasks } from '@/lib/db/schema';
import { TaskStatus } from '@/lib/db/enums';
import { isTaskPoolRepositorySource, listTaskPoolTasks } from '@/lib/integrations/task-pool';

export const dynamic = 'force-dynamic';

// Returns Monday 00:00:00 ET for the given week offset (0 = current, -1 = last, etc.)
function weekBounds(weekOffset: number): { start: Date; end: Date } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const daysToMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysToMonday + weekOffset * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 7);
  return { start: monday, end: sunday };
}

type TrophyTask = { id: string; title: string; priority: string; completedAt: string };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const weekOffset = parseInt(searchParams.get('week') ?? '0', 10);
  const mode = searchParams.get('mode') ?? 'week';

  let start: Date;
  let end: Date;

  if (mode === 'day') {
    end = new Date();
    start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  } else {
    ({ start, end } = weekBounds(isNaN(weekOffset) ? 0 : weekOffset));
  }

  let trophyTasks: TrophyTask[] = [];

  if (isTaskPoolRepositorySource()) {
    // Task-pool mode: tasks live in GitHub Issues. "Done" = issue closed.
    // We don't have a real completedAt, so use updatedAt as a proxy.
    const pool = (await listTaskPoolTasks()) ?? [];
    trophyTasks = pool
      .filter((t) => t.status === TaskStatus.DONE)
      .filter((t) => {
        const ts = (t.updatedAt as unknown as Date) ?? new Date(0);
        return ts >= start && ts < end;
      })
      .map((t) => ({
        id: t.id,
        title: t.title,
        priority: String(t.priority ?? 'medium').toLowerCase(),
        completedAt: (t.updatedAt as unknown as Date).toISOString(),
      }))
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  } else {
    // DB mode.
    const doneTasks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        priority: tasks.priority,
        completedAt: tasks.completedAt,
        updatedAt: tasks.updatedAt,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.status, TaskStatus.DONE),
          or(
            and(isNotNull(tasks.completedAt), gte(tasks.completedAt, start), lt(tasks.completedAt, end)),
            and(isNull(tasks.completedAt), gte(tasks.updatedAt, start), lt(tasks.updatedAt, end))
          )
        )
      )
      .orderBy(desc(tasks.completedAt))
      .catch(() => []);

    trophyTasks = doneTasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: String(t.priority).toLowerCase(),
      completedAt: (t.completedAt ?? t.updatedAt).toISOString(),
    }));
  }

  // Commands are DB-only; still surface them when available.
  let commandRows: Array<{ id: string; input: string; channel: string; completedAt: string | null }> = [];
  try {
    const rows = await db
      .select({
        id: commands.id,
        input: commands.input,
        completedAt: commands.completedAt,
        sourceChannel: commands.sourceChannel,
      })
      .from(commands)
      .where(and(isNotNull(commands.completedAt), gte(commands.completedAt, start), lt(commands.completedAt, end)))
      .orderBy(desc(commands.completedAt));
    commandRows = rows.map((c) => ({
      id: c.id,
      input: c.input,
      channel: c.sourceChannel,
      completedAt: c.completedAt?.toISOString() ?? null,
    }));
  } catch {
    commandRows = [];
  }

  // Daily-anchor trophies — written as AuditEvent rows when all six anchors
  // are completed in one day. One trophy per day max (enforced via entityId).
  let anchors: Array<{ id: string; date: string; completedAt: string }> = [];
  try {
    const rows = await db
      .select({
        id: auditEvents.id,
        entityId: auditEvents.entityId,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityType, 'WellnessAnchor'),
          eq(auditEvents.eventType, 'COMPLETED'),
          gte(auditEvents.createdAt, start),
          lt(auditEvents.createdAt, end)
        )
      )
      .orderBy(desc(auditEvents.createdAt));
    anchors = rows.map((r) => ({
      id: r.id,
      date: r.entityId, // entityId is YYYY-MM-DD (ET)
      completedAt: r.createdAt.toISOString(),
    }));
  } catch {
    anchors = [];
  }

  // Campaigns trophied from Dispatch → show them in the Trophy Case too.
  let campaignTrophies: Array<{ id: string; title: string; completedAt: string }> = [];
  try {
    const rows = await db
      .select({
        id: auditEvents.id,
        entityId: auditEvents.entityId,
        createdAt: auditEvents.createdAt,
        metadata: auditEvents.metadata,
      })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entityType, 'DispatchCampaign'),
          eq(auditEvents.eventType, 'TROPHIED'),
          gte(auditEvents.createdAt, start),
          lt(auditEvents.createdAt, end)
        )
      )
      .orderBy(desc(auditEvents.createdAt));
    campaignTrophies = rows.map((r) => {
      const meta = (r.metadata as { title?: string } | null) ?? {};
      return {
        id: r.id,
        title: meta.title ?? `Campaign ${r.entityId.slice(0, 8)}`,
        completedAt: r.createdAt.toISOString(),
      };
    });
  } catch {
    campaignTrophies = [];
  }

  // Group by YYYY-MM-DD in ET
  const byDay: Record<string, TrophyTask[]> = {};
  for (const t of trophyTasks) {
    const day = new Date(t.completedAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(t);
  }

  return NextResponse.json({
    weekOffset: isNaN(weekOffset) ? 0 : weekOffset,
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    since: start.toISOString(),
    totals: {
      tasks: trophyTasks.length,
      commands: commandRows.length,
      events: 0,
      anchors: anchors.length,
      campaigns: campaignTrophies.length,
    },
    byDay,
    tasks: trophyTasks,
    commands: commandRows,
    anchors,
    campaigns: campaignTrophies,
  });
}
