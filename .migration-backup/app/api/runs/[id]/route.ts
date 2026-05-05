import { NextResponse } from 'next/server';
import { getRun } from '@/lib/services/runs';

interface Params { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const run = await getRun(params.id);
  if (!run) return NextResponse.json({ message: 'Not found' }, { status: 404 });
  return NextResponse.json(run);
}
