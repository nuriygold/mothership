import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getStreamDefs } from '@/lib/v2/revenue-streams-server';
import { publishV2Event } from '@/lib/v2/event-bus';
import { sendTelegramMessage } from '@/lib/services/telegram';
import { TaskPriority, TaskStatus } from '@/lib/db/prisma-types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const body = await req.json();
  const rawStream = String(body?.stream ?? '').trim();
  const title = String(body?.title ?? '').trim();
  const description = body?.description ? String(body.description).trim() : undefined;
  const priority = (body?.priority as TaskPriority) ?? TaskPriority.MEDIUM;

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }

  const defs = await getStreamDefs();
  const normalized = rawStream.toLowerCase().replace(/\s+/g, '-');
  const def =
    defs.find((s) => s.key === normalized) ??
    defs.find((s) => s.displayName.toLowerCase() === rawStream.toLowerCase());

  if (!def) {
    return NextResponse.json({ error: `Unknown stream: ${rawStream}` }, { status: 404 });
  }

  const task = await prisma.task.create({
    data: {
      title,
      description: description ?? null,
      assignee: def.leadDisplay,
      status: TaskStatus.TODO,
      priority,
    },
  });

  const notification = await prisma.notification.create({
    data: {
      type: 'task_assigned',
      title: `Task assigned to ${def.leadDisplay}`,
      body: title,
      href: '/tasks',
    },
  });

  publishV2Event('notifications', 'new', {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    href: notification.href,
    createdAt: notification.createdAt.toISOString(),
  });

  publishV2Event('revenue-streams', 'action', {
    stream: def.key,
    action: 'assign-task',
    taskId: task.id,
    taskTitle: title,
  });

  void sendTelegramMessage({
    text: `📋 *Task assigned to ${def.leadDisplay}* (${def.displayName} stream)\n${title}${description ? `\n\n${description}` : ''}`,
  }).catch(() => {});

  return NextResponse.json({ ok: true, task: { id: task.id, title, assignee: def.leadDisplay }, notificationId: notification.id });
}
