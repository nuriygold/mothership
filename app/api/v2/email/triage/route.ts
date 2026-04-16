import { NextResponse } from 'next/server';
import { listPendingTriages } from '@/lib/services/emailTriage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await listPendingTriages();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[email:triage:list]', err);
    return NextResponse.json({ triages: [], lastRunAt: null });
  }
}
