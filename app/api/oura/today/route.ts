import { NextResponse } from 'next/server';
import { getOuraTodayData } from '@/lib/oura';

export async function GET() {
  try {
    const data = await getOuraTodayData();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ connected: false });
  }
}
