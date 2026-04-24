import { type NextRequest, NextResponse } from 'next/server';
import { createTask } from '@/lib/services/tasks';
import { getV2EmailFeed } from '@/lib/v2/orchestrator';
import { TaskPriority } from '@/lib/db/prisma-types';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailId = params.id;
  let body: { type?: 'task' | 'financial' } = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const feed = await getV2EmailFeed();
  const email = feed.inbox.find((item) => item.id === emailId);

  const title = email ? email.subject : `Email task (${emailId})`;
  const description = email
    ? `From: ${email.sender}\n\nEmail: ${email.snippet ?? email.subject}`
    : undefined;

  const isFinancial = body.type === 'financial';
  const task = await createTask({
    title: isFinancial ? `[Finance] ${title}` : title,
    description,
    priority: isFinancial ? TaskPriority.HIGH : TaskPriority.MEDIUM,
  });

  return NextResponse.json({ ok: true, task });
}
