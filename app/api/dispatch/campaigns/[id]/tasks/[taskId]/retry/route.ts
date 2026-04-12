import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { retryDispatchTask } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  try {
    const body = await req.json().catch(() => ({}));
    const agentId = body?.agentId ? String(body.agentId) : undefined;

    // Fire-and-forget via waitUntil so Vercel keeps the function alive
    waitUntil(
      retryDispatchTask(params.taskId, agentId).catch((err: unknown) => {
        console.error(`[dispatch] Task ${params.taskId} retry failed:`, err);
      })
    );

    return NextResponse.json({ ok: true, status: 'QUEUED', message: 'Task retry started' });
  } catch (error) {
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
