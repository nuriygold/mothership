import { type NextRequest, NextResponse } from 'next/server';
import { createTaskPoolIssue } from '@/lib/integrations/task-pool';
import { TaskPriority } from '@prisma/client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v2/buy
 *
 * Called by OpenClaw or any external system to add an item to the shopping list.
 * Creates a GitHub Issue in the task-pool repo with domain:shopping label.
 *
 * Body: { item: string, description?: string, priority?: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL" }
 * Returns: { ok: true, id, title, url }
 */
export async function POST(req: NextRequest) {
  let body: { item?: string; description?: string; priority?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = body.item?.trim();
  if (!title) {
    return NextResponse.json({ error: 'Missing required field: item' }, { status: 400 });
  }

  const priorityMap: Record<string, TaskPriority> = {
    LOW: TaskPriority.LOW,
    MEDIUM: TaskPriority.MEDIUM,
    HIGH: TaskPriority.HIGH,
    CRITICAL: TaskPriority.CRITICAL,
  };
  const priority = priorityMap[body.priority?.toUpperCase() ?? ''] ?? TaskPriority.MEDIUM;

  const issue = await createTaskPoolIssue({
    title,
    description: body.description,
    priority,
    workflowId: 'tpw_shopping',
  });

  if (!issue) {
    return NextResponse.json(
      { error: 'Failed to create shopping issue. Verify GITHUB_TOKEN is set.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: issue.id,
    title: issue.title,
    url: issue.sourceUrl,
  });
}
