import { NextResponse } from 'next/server';
import { listAgents } from '@/lib/ops/store';
import { requireOpsAuth } from '@/lib/ops/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireOpsAuth();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ agents: listAgents() });
}
