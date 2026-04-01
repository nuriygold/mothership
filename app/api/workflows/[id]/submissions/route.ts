import { NextResponse } from 'next/server';
import { listSubmissions, createSubmission } from '@/lib/services/submissions';

interface Params { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const submissions = await listSubmissions(params.id);
  return NextResponse.json(submissions);
}

export async function POST(req: Request, { params }: Params) {
  const body = await req.json();
  const submission = await createSubmission({ ...body, workflowId: params.id });
  return NextResponse.json(submission, { status: 201 });
}
