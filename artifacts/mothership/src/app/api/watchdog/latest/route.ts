import { NextResponse } from 'next/server';
import { readLatestUiWatchdogRun } from '@/lib/watchdog/store';

export async function GET() {
  const report = await readLatestUiWatchdogRun();
  if (!report) {
    return NextResponse.json({ message: 'No watchdog run found' }, { status: 404 });
  }
  return NextResponse.json(report, { status: 200 });
}
