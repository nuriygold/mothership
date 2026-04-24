import { NextResponse } from 'next/server';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { listTasks, updateTask, createTask } from '@/lib/services/tasks';
import { createAuditEvent } from '@/lib/services/audit';
import { sendTelegramMessage } from '@/lib/services/telegram';
import { getV2FinanceOverview } from '@/lib/v2/orchestrator';
import { createDispatchCampaign } from '@/lib/services/dispatch';
import { createTaskPoolIssue } from '@/lib/integrations/task-pool';
import { createVisionItem, getOrCreateVisionBoard, listVisionPillars } from '@/lib/services/vision';
import { prisma } from '@/lib/prisma';
import { TaskStatus, TaskPriority } from '@/lib/db/prisma-types';

export const dynamic = 'force-dynamic';

const execAsync = promisify(exec);

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

// ─── Security: exec allowlist ─────────────────────────────────────────────────

function isAllowedChatId(chatId: number): boolean {
  const allowed = process.env.TELEGRAM_ALLOWED_CHAT_IDS;
  if (!allowed) return false;
  return allowed.split(',').map((s) => s.trim()).includes(String(chatId));
}

// ─── Task commands ────────────────────────────────────────────────────────────

async function handleTaskStatus(rest: string, status: TaskStatus) {
  if (!rest) return 'Please provide a task id. Example: /done tpt_123';
  const taskId = rest.split(/\s+/)[0];
  await updateTask({ id: taskId, status });
  await createAuditEvent({
    entityType: 'task',
    entityId: taskId,
    eventType: 'telegram_status_change',
    metadata: { status },
  });
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
  await createAuditEvent({
    entityType: 'task',
    entityId: taskId,
    eventType: 'telegram_priority_change',
    metadata: { priority: value },
  });
  return `Updated ${taskId} priority to ${value}.`;
}

async function handleCreate(rest: string) {
  const title = rest.trim();
  if (!title) return 'Usage: /create <task title>';
  const task = await createTask({
    title,
    sourceChannel: 'telegram',
    priority: TaskPriority.HIGH,
    ownerLogin: process.env.DEFAULT_TASK_OWNER_LOGIN ?? null,
  } as any);
  await createAuditEvent({
    entityType: 'task',
    entityId: task.id,
    eventType: 'telegram_create',
    metadata: { title, priority: TaskPriority.HIGH, ownerLogin: process.env.DEFAULT_TASK_OWNER_LOGIN ?? null },
  });
  return `Created task ${task.id}: ${task.title}`;
}

async function handleAssign(rest: string) {
  const parts = rest.split(/\s+/).filter(Boolean);
  const [taskId, owner, maybePriority] = parts;
  if (!taskId || !owner) {
    return 'Usage: /assign <taskId> <github_login> [priority]';
  }
  const priority = maybePriority ? maybePriority.toUpperCase() : undefined;
  const valid = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
  const parsedPriority = valid.includes(priority as any)
    ? (priority as TaskPriority)
    : TaskPriority.HIGH;
  await updateTask({ id: taskId, ownerLogin: owner, priority: parsedPriority });
  await createAuditEvent({
    entityType: 'task',
    entityId: taskId,
    eventType: 'telegram_assign',
    metadata: { ownerLogin: owner, priority: parsedPriority },
  });
  return `Assigned ${taskId} to ${owner} with priority ${parsedPriority}.`;
}

async function handleReassign(rest: string) {
  const parts = rest.split(/\s+/).filter(Boolean);
  const [taskId, owner] = parts;
  if (!taskId || !owner) {
    return 'Usage: /reassign <taskId> <github_login>';
  }
  await updateTask({ id: taskId, ownerLogin: owner });
  await createAuditEvent({
    entityType: 'task',
    entityId: taskId,
    eventType: 'telegram_reassign',
    metadata: { ownerLogin: owner },
  });
  return `Reassigned ${taskId} to ${owner}.`;
}

async function handleListOpen() {
  const tasks = await listTasks();
  const open = (tasks as any[]).filter((t) => t.status !== 'DONE').slice(0, 5);
  if (open.length === 0) return 'No open tasks.';
  return open.map((t) => `${t.id}: ${t.title} (${t.status})`).join('\n');
}

// ─── /add — task pool issue ───────────────────────────────────────────────────

async function handleAdd(rest: string) {
  const title = rest.trim();
  if (!title) return 'Usage: /add <task title>';
  const issue = await createTaskPoolIssue({
    title,
    priority: TaskPriority.HIGH,
  });
  if (!issue) return 'Failed to create task pool issue. Check GITHUB_TOKEN.';
  return `Added to task pool: "${issue.title}" (${issue.id})`;
}

// ─── /vision — vision board item ─────────────────────────────────────────────

async function handleVision(rest: string) {
  const title = rest.trim();
  if (!title) return 'Usage: /vision <item title>';
  const board = await getOrCreateVisionBoard();
  const pillars = await listVisionPillars(board.id);
  if (!pillars.length) return 'No vision pillars found. Create one first on the Vision page.';
  const pillar = pillars[0];
  const item = await createVisionItem(pillar.id, { title });
  return `Added "${item.title}" to Vision Board (${pillar.label} pillar).`;
}

// ─── /buy — shopping list item ────────────────────────────────────────────────

async function handleBuy(rest: string) {
  const title = rest.trim();
  if (!title) return 'Usage: /buy <item to buy>';
  const issue = await createTaskPoolIssue({
    title,
    priority: TaskPriority.MEDIUM,
    workflowId: 'tpw_shopping',
  });
  if (!issue) return 'Failed to add shopping item. Check GITHUB_TOKEN.';
  return `Added to shopping list: "${issue.title}"`;
}

// ─── /dispatch — create dispatch campaign ────────────────────────────────────

async function handleDispatch(rest: string) {
  const title = rest.trim();
  if (!title) return 'Usage: /dispatch <campaign title>';
  const campaign = await createDispatchCampaign({ title });
  return `Dispatch campaign created: "${campaign.title}" (${campaign.id})\nOpen Dispatch page to plan and execute.`;
}

// ─── /bill — add payable ──────────────────────────────────────────────────────
// Formats: /bill Spectrum $89.99 2026-05-01
//          /bill Rent $2400 05/01
//          /bill Amex $340          ← no due date

async function handleBill(rest: string) {
  const raw = rest.trim();
  if (!raw) return 'Usage: /bill <vendor> $<amount> [due-date]';

  // Parse: last token that is a date, second-to-last that starts with $, everything before = vendor
  const tokens = raw.split(/\s+/);

  let dueDate: Date | null = null;
  let amountStr: string | null = null;
  let vendorParts: string[] = [];

  // Walk tokens right-to-left
  let remaining = [...tokens];

  // Try to parse last token as a date (YYYY-MM-DD or MM/DD or MM-DD)
  const lastToken = remaining[remaining.length - 1];
  const dateMatch = lastToken?.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2})$/);
  if (dateMatch) {
    const raw = dateMatch[1];
    if (raw.includes('-') && raw.length === 10) {
      dueDate = new Date(`${raw}T12:00:00.000Z`);
    } else {
      const [m, d] = raw.split(/[\/\-]/);
      const year = new Date().getFullYear();
      dueDate = new Date(`${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00.000Z`);
    }
    remaining = remaining.slice(0, -1);
  }

  // Try to find amount token (starts with $ or is a number)
  for (let i = remaining.length - 1; i >= 0; i--) {
    const t = remaining[i];
    if (/^\$?\d+(\.\d{1,2})?$/.test(t)) {
      amountStr = t.replace('$', '');
      vendorParts = remaining.slice(0, i);
      break;
    }
  }

  if (!amountStr) return 'Could not parse amount. Usage: /bill <vendor> $<amount> [due-date]';
  const vendor = vendorParts.join(' ').trim() || 'Unknown vendor';
  const amount = parseFloat(amountStr);

  await prisma.payable.create({
    data: {
      vendor,
      amount,
      currency: 'USD',
      dueDate,
      status: 'pending',
    },
  });

  const dueLine = dueDate ? ` due ${dueDate.toISOString().slice(0, 10)}` : '';
  return `Bill logged: ${vendor} — $${amount.toFixed(2)}${dueLine}`;
}

// ─── /exec — run terminal command ────────────────────────────────────────────

async function handleExec(rest: string, chatId: number) {
  if (!isAllowedChatId(chatId)) {
    // Silently ignore — do not reveal the command exists to unauthorised callers
    return null;
  }
  const cmd = rest.trim();
  if (!cmd) return 'Usage: /exec <shell command>';

  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 30_000 });
    const out = (stdout + (stderr ? `\nSTDERR:\n${stderr}` : '')).trim();
    const truncated = out.length > 3800 ? out.slice(0, 3800) + '\n…(truncated)' : out;
    return truncated || '(no output)';
  } catch (err: any) {
    const msg = err?.stderr || err?.stdout || err?.message || String(err);
    return `Error: ${String(msg).slice(0, 1000)}`;
  }
}

// ─── Finance commands ─────────────────────────────────────────────────────────

async function handleBalance() {
  const data = await getV2FinanceOverview();
  if (!data.accounts.length) return 'No accounts found.';
  const lines = data.accounts.map(
    (a) => `*${a.name}* (${a.type}): $${a.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  );
  return `*Account Balances*\n${lines.join('\n')}`;
}

async function handlePayables() {
  const data = await getV2FinanceOverview();
  if (!data.payables.length) return 'No pending payables.';
  const lines = data.payables.map(
    (p) => `• ${p.vendor}: $${p.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — ${p.dueDate} [${p.status}]`
  );
  return `*Pending Payables*\n${lines.join('\n')}`;
}

async function handlePlans() {
  const data = await getV2FinanceOverview();
  const active = data.plans.filter((p) => p.status === 'ACTIVE');
  if (!active.length) return 'No active finance plans.';
  const lines = active.map(
    (p) => `• *${p.title}*: ${p.progressPercent ?? 0}% complete`
  );
  return `*Active Finance Plans*\n${lines.join('\n')}`;
}

async function handleFinanceSummary() {
  const data = await getV2FinanceOverview();
  const liquid = data.accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const debt = data.accounts.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0);
  const score = data.healthScore?.score ?? 'N/A';
  const payableCount = data.payables.length;
  const fmt = (n: number) =>
    `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    `*Finance Snapshot*\n` +
    `Assets: ${fmt(liquid)}\n` +
    `Debt: ${fmt(debt)}\n` +
    `Pending payables: ${payableCount}\n` +
    `Health score: ${score}`
  );
}

// ─── Help ─────────────────────────────────────────────────────────────────────

const HELP_TEXT =
  '*Task commands*\n' +
  '/open — list open tasks\n' +
  '/create <title> — create task (local DB)\n' +
  '/add <title> — add to task pool (GitHub)\n' +
  '/done <id> — mark complete\n' +
  '/block <id> — mark blocked\n' +
  '/progress <id> — mark in progress\n' +
  '/priority <id> <level> — set priority\n' +
  '/assign <id> <login> [priority]\n' +
  '/reassign <id> <login>\n' +
  '\n*Capture commands*\n' +
  '/buy <item> — add to shopping list\n' +
  '/vision <item> — add to vision board\n' +
  '/bill <vendor> $<amount> [date] — log a bill\n' +
  '/dispatch <title> — create dispatch campaign\n' +
  '\n*Finance commands*\n' +
  '/balance — account balances\n' +
  '/payables — upcoming bills\n' +
  '/plans — active finance plans\n' +
  '/finance — full snapshot\n' +
  '\n*System commands*\n' +
  '/polo <cmd> — run terminal command (restricted)';

// ─── Router ───────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as TelegramUpdate;
    const message = body.message;
    if (!message?.text) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;

    await createAuditEvent({
      entityType: 'telegram',
      entityId: String(body.update_id),
      eventType: 'telegram_inbound',
      metadata: {
        text: message.text,
        chatId: String(chatId),
        username: message.from?.username ?? message.from?.first_name ?? 'unknown',
        botKey: 'webhook',
      },
    });

    const command = parseCommand(message.text);

    if (!command) {
      await sendTelegramMessage({ text: 'Unrecognized input. Try /help for a full command list.', chatId: String(chatId) });
      return NextResponse.json({ ok: true });
    }

    let reply: string | null = '';

    switch (command.cmd) {
      // Task
      case '/open':      reply = await handleListOpen(); break;
      case '/done':      reply = await handleTaskStatus(command.rest, TaskStatus.DONE); break;
      case '/block':     reply = await handleTaskStatus(command.rest, TaskStatus.BLOCKED); break;
      case '/progress':  reply = await handleTaskStatus(command.rest, TaskStatus.IN_PROGRESS); break;
      case '/priority':  reply = await handlePriority(command.rest); break;
      case '/create':    reply = await handleCreate(command.rest); break;
      case '/assign':    reply = await handleAssign(command.rest); break;
      case '/reassign':  reply = await handleReassign(command.rest); break;
      // Capture
      case '/add':       reply = await handleAdd(command.rest); break;
      case '/vision':    reply = await handleVision(command.rest); break;
      case '/buy':       reply = await handleBuy(command.rest); break;
      case '/bill':      reply = await handleBill(command.rest); break;
      case '/dispatch':  reply = await handleDispatch(command.rest); break;
      // Finance
      case '/balance':   reply = await handleBalance(); break;
      case '/payables':  reply = await handlePayables(); break;
      case '/plans':     reply = await handlePlans(); break;
      case '/finance':   reply = await handleFinanceSummary(); break;
      // System
      case '/polo':      reply = await handleExec(command.rest, chatId); break;
      // Help
      case '/help':      reply = HELP_TEXT; break;
      default:
        reply = 'Unknown command. Try /help for a full list.';
    }

    // null reply = silent drop (exec from unauthorised chat)
    if (reply !== null) {
      await sendTelegramMessage({ text: reply, chatId: String(chatId) });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
