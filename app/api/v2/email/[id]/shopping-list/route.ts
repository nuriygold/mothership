import { type NextRequest, NextResponse } from 'next/server';
import { createTask } from '@/lib/services/tasks';
import { getV2EmailFeed } from '@/lib/v2/orchestrator';
import { TaskPriority } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailId = params.id;
  let body: { name?: string; notes?: string } = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const feed = await getV2EmailFeed();
  const email = feed.inbox.find((item) => item.id === emailId);

  const title = body.name?.trim() || (email ? `Buy: ${email.subject}` : `Shopping item from email ${emailId}`);
  const description = body.notes ?? (email ? `From: ${email.sender}\n\nEmail: ${email.snippet ?? email.subject}` : undefined);

  const task = await createTask({
    title,
    description,
    priority: TaskPriority.MEDIUM,
    workflowId: 'tpw_shopping', // Creates domain:shopping label
  });

  return NextResponse.json({ ok: true, task });
}
