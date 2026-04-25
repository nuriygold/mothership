import { NextResponse } from 'next/server';
import { listAgents } from '@/lib/ops/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ agents: listAgents() });
}
