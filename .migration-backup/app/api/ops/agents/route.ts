import { NextResponse } from 'next/server';
import { listAgents } from '@/lib/ops/service';
import { requireOpsAuth } from '@/lib/ops/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireOpsAuth();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ agents: await listAgents() });
}
