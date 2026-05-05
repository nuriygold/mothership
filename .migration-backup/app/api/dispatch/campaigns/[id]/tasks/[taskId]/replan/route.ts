import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { replanDispatchTask } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  try {
    waitUntil(
      replanDispatchTask(params.id, params.taskId).catch((err: unknown) => {
        console.error(`[dispatch] Task ${params.taskId} re-plan failed:`, err);
      })
    );

    return NextResponse.json({ ok: true, status: 'REPLANNING', message: 'Re-plan started' });
  } catch (error) {
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
