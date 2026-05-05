import { NextResponse } from 'next/server';
import { getWorkflow } from '@/lib/services/workflows';

interface Params { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const workflow = await getWorkflow(params.id);
  if (!workflow) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json(workflow);
}
