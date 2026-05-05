import { NextResponse } from 'next/server';
import { listTasks, createTask } from '@/lib/services/tasks';

export async function GET() {
  const tasks = await listTasks();
  return NextResponse.json(tasks);
}

export async function POST(req: Request) {
  const body = await req.json();
  const task = await createTask(body);
  return NextResponse.json(task, { status: 201 });
}
