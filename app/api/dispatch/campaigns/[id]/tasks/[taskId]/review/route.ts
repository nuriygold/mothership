import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { reviewDispatchTask } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  try {
    waitUntil(
      reviewDispatchTask(params.taskId).catch((err: unknown) => {
        console.error(`[dispatch] Task ${params.taskId} review failed:`, err);
      })
    );

    return NextResponse.json({ ok: true, status: 'REVIEWING', message: 'Emerald review started' });
  } catch (error) {
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
