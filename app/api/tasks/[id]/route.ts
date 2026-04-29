import { NextResponse } from 'next/server';
import { TaskPriority, TaskStatus } from '@/lib/db/enums';
import { updateTask } from '@/lib/services/tasks';

interface Params {
  params: { id: string };
}

function parseStatus(value: unknown): TaskStatus | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'TODO' || value === 'IN_PROGRESS' || value === 'BLOCKED' || value === 'DONE') {
    return value;
  }
  return undefined;
}

function parsePriority(value: unknown): TaskPriority | undefined {
  if (typeof value !== 'string') return undefined;
  if (value === 'LOW' || value === 'MEDIUM' || value === 'HIGH' || value === 'CRITICAL') {
    return value;
  }
  return undefined;
}

export async function PATCH(req: Request, { params }: Params) {
  const body = await req.json();
  const status = parseStatus(body?.status);
  const priority = parsePriority(body?.priority);

  if (!status && !priority) {
    return NextResponse.json({ message: 'No valid task updates provided' }, { status: 400 });
  }

  try {
    const task = await updateTask({
      id: params.id,
      status,
      priority,
    });
    return NextResponse.json(task);
  } catch (error) {
    return NextResponse.json({ message: 'Failed to update task', error: String(error) }, { status: 500 });
  }
}
