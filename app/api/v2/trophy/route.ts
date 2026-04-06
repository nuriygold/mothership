import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { TaskStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [doneTasks, completedCommands, auditEvents] = await Promise.allSettled([
    prisma.task.findMany({
      where: { status: TaskStatus.DONE, updatedAt: { gte: since } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, title: true, description: true, priority: true, updatedAt: true },
    }),
    prisma.command.findMany({
      where: { completedAt: { gte: since } },
      orderBy: { completedAt: 'desc' },
      select: { id: true, input: true, completedAt: true, sourceChannel: true },
    }),
    prisma.auditEvent.findMany({
      where: {
        eventType: { in: ['approved', 'completed', 'done', 'resolved'] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, entityType: true, eventType: true, metadata: true, createdAt: true },
    }),
  ]);

  const tasks = doneTasks.status === 'fulfilled' ? doneTasks.value : [];
  const commands = completedCommands.status === 'fulfilled' ? completedCommands.value : [];
  const events = auditEvents.status === 'fulfilled' ? auditEvents.value : [];

  return NextResponse.json({
    since: since.toISOString(),
    totals: {
      tasks: tasks.length,
      commands: commands.length,
      events: events.length,
    },
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      completedAt: t.updatedAt.toISOString(),
    })),
    commands: commands.map((c) => ({
      id: c.id,
      input: c.input,
      channel: c.sourceChannel,
      completedAt: c.completedAt?.toISOString() ?? null,
    })),
    events: events.map((e) => ({
      id: e.id,
      entityType: e.entityType,
      eventType: e.eventType,
      completedAt: e.createdAt.toISOString(),
    })),
  });
}
