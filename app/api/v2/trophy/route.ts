import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TaskStatus } from '@prisma/client';

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

  const [doneTasks, completedCommands] = await Promise.allSettled([
    prisma.task.findMany({
      where: {
        status: TaskStatus.DONE,
        OR: [
          { completedAt: { gte: start, lt: end } },
          { completedAt: null, updatedAt: { gte: start, lt: end } },
        ],
      },
      orderBy: { completedAt: 'desc' },
      select: { id: true, title: true, priority: true, completedAt: true, updatedAt: true },
    }),
    prisma.command.findMany({
      where: { completedAt: { gte: start, lt: end } },
      orderBy: { completedAt: 'desc' },
      select: { id: true, input: true, completedAt: true, sourceChannel: true },
    }),
  ]);

  const tasks = doneTasks.status === 'fulfilled' ? doneTasks.value : [];
  const commands = completedCommands.status === 'fulfilled' ? completedCommands.value : [];

  // Group tasks by YYYY-MM-DD in ET
  const byDay: Record<string, Array<{ id: string; title: string; priority: string; completedAt: string }>> = {};
  for (const t of tasks) {
    const ts = t.completedAt ?? t.updatedAt;
    const day = ts.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push({
      id: t.id,
      title: t.title,
      priority: t.priority,
      completedAt: ts.toISOString(),
    });
  }

  return NextResponse.json({
    weekOffset: isNaN(weekOffset) ? 0 : weekOffset,
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    totals: { tasks: tasks.length, commands: commands.length },
    byDay,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      completedAt: (t.completedAt ?? t.updatedAt).toISOString(),
    })),
    commands: commands.map((c) => ({
      id: c.id,
      input: c.input,
      channel: c.sourceChannel,
      completedAt: c.completedAt?.toISOString() ?? null,
    })),
  });
}
