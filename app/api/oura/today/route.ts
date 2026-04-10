import { NextRequest, NextResponse } from 'next/server';
import { getOuraTodayData } from '@/lib/oura';

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') ?? undefined;
    const data = await getOuraTodayData(date);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ connected: false });
  }
}
