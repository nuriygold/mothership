import { NextResponse } from 'next/server';
import { createWorkflow, listWorkflows } from '@/lib/services/workflows';

export async function GET() {
  const workflows = await listWorkflows();
  return NextResponse.json(workflows);
}

export async function POST(req: Request) {
  const body = await req.json();
  const workflow = await createWorkflow(body);
  return NextResponse.json(workflow, { status: 201 });
}
