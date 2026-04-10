import { NextResponse } from 'next/server';
import { checkGateway } from '@/lib/services/openclaw';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await checkGateway();
  return NextResponse.json(status, { status: status.ok ? 200 : 503 });
}
