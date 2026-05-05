import { NextResponse } from 'next/server';
import { createDispatchTask } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const title = String(body?.title ?? '').trim();

    if (!title) {
      return NextResponse.json({ ok: false, message: 'Title is required' }, { status: 400 });
    }

    const task = await createDispatchTask(params.id, {
      title,
      description: body?.description ? String(body.description) : undefined,
      priority:
        body?.priority !== undefined && body.priority !== null
          ? Number(body.priority)
          : undefined,
      dependencies: Array.isArray(body?.dependencies)
        ? body.dependencies.map(String).filter(Boolean)
        : undefined,
      toolRequirements: Array.isArray(body?.toolRequirements)
        ? body.toolRequirements.map(String).filter(Boolean)
        : undefined,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
