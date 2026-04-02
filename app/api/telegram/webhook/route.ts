import { NextResponse } from 'next/server';
import { listTasks, updateTask, createTask } from '@/lib/services/tasks';
import { sendTelegramMessage } from '@/lib/services/telegram';
import { TaskStatus, TaskPriority } from '@prisma/client';

export const dynamic = 'force-dynamic';

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; is_bot: boolean; first_name?: string; username?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
  };
};

function parseCommand(text: string | undefined) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return null;
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const rest = parts.slice(1).join(' ');
  return { cmd, rest };
}

async function handleTaskStatus(rest: string, status: TaskStatus) {
  if (!rest) return 'Please provide a task id. Example: /done tpt_123';
  const taskId = rest.split(/\s+/)[0];
  await updateTask({ id: taskId, status });
  return `Updated ${taskId} to ${status}.`;
}

async function handlePriority(rest: string) {
  const [taskId, priorityRaw] = rest.split(/\s+/, 2);
  if (!taskId || !priorityRaw) {
    return 'Usage: /priority <taskId> <LOW|MEDIUM|HIGH|CRITICAL>';
  }
  const value = priorityRaw.toUpperCase();
  const valid = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
  if (!valid.includes(value as any)) {
    return 'Priority must be LOW, MEDIUM, HIGH, or CRITICAL.';
  }
  await updateTask({ id: taskId, priority: value as TaskPriority });
  return `Updated ${taskId} priority to ${value}.`;
}

async function handleCreate(rest: string) {
  const title = rest.trim();
  if (!title) return 'Usage: /create <task title>';
  const task = await createTask({ title, sourceChannel: 'telegram' } as any);
  return `Created task ${task.id}: ${task.title}`;
}

async function handleAssign(rest: string) {
  const [taskId, owner] = rest.split(/\s+/, 2);
  if (!taskId || !owner) {
    return 'Usage: /assign <taskId> <github_login>';
  }
  await updateTask({ id: taskId, ownerLogin: owner });
  return `Assigned ${taskId} to ${owner}.`;
}

async function handleListOpen() {
  const tasks = await listTasks();
  const open = (tasks as any[]).filter((t) => t.status !== 'DONE').slice(0, 5);
  if (open.length === 0) return 'No open tasks.';
  return open.map((t) => `${t.id}: ${t.title} (${t.status})`).join('\n');
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TelegramUpdate;
    const message = body.message;
    if (!message?.text) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const command = parseCommand(message.text);

    if (!command) {
      await sendTelegramMessage({ text: 'Unrecognized input. Use /open, /done <id>, /block <id>, /progress <id>.', chatId: String(chatId) });
      return NextResponse.json({ ok: true });
    }

    let reply = '';
    if (command.cmd === '/open') {
      reply = await handleListOpen();
    } else if (command.cmd === '/done') {
      reply = await handleTaskStatus(command.rest, TaskStatus.DONE);
    } else if (command.cmd === '/block') {
      reply = await handleTaskStatus(command.rest, TaskStatus.BLOCKED);
    } else if (command.cmd === '/progress') {
      reply = await handleTaskStatus(command.rest, TaskStatus.IN_PROGRESS);
    } else if (command.cmd === '/priority') {
      reply = await handlePriority(command.rest);
    } else if (command.cmd === '/create') {
      reply = await handleCreate(command.rest);
    } else if (command.cmd === '/assign') {
      reply = await handleAssign(command.rest);
    } else {
      reply = 'Commands: /open, /done <taskId>, /block <taskId>, /progress <taskId>, /priority <taskId> <LOW|MEDIUM|HIGH|CRITICAL>, /create <title>, /assign <taskId> <github_login>';
    }

    await sendTelegramMessage({ text: reply, chatId: String(chatId) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
