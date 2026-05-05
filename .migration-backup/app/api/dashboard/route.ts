import { NextResponse } from 'next/server';
import { getDashboard } from '@/lib/services/dashboard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await getDashboard();
  return NextResponse.json(data);
}
