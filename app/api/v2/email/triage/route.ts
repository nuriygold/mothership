import { NextResponse } from 'next/server';
import { listPendingTriages } from '@/lib/services/emailTriage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const triages = await listPendingTriages();
    return NextResponse.json({ triages });
  } catch (err) {
    console.error('[email:triage:list]', err);
    return NextResponse.json({ triages: [] });
  }
}
