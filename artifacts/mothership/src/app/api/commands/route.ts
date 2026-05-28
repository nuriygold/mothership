import { NextResponse } from 'next/server';
import { listCommands, createCommand } from '@/lib/services/commands';

/**
 * GET /api/commands
 *
 * Fields accessed by dispatch/page.tsx (CommandItem[]):
 *   id, input, sourceChannel, status
 *   run?.type  (run is nullable — rendered only when present)
 *
 * POST /api/commands
 * Body: { input: string; sourceChannel: string; requestedById?: string | null }
 * Success: the created command record
 * Error:   { message: string }
 */

export async function GET() {
  try {
    const rows = await listCommands(20);
    // Shape to match CommandItem — only the fields the FE accesses
    const items = rows.map((row) => ({
      id: row.id,
      input: row.input,
      sourceChannel: row.sourceChannel,
      status: row.status,
      run: row.run?.id
        ? { type: row.run.type ?? undefined }
        : null,
    }));
    return NextResponse.json(items);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ route: 'GET /api/commands', error: message, timestamp: new Date().toISOString() }));
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.input !== 'string' || !body.input.trim()) {
      return NextResponse.json({ message: 'input is required' }, { status: 400 });
    }
    if (typeof body.sourceChannel !== 'string' || !body.sourceChannel.trim()) {
      return NextResponse.json({ message: 'sourceChannel is required' }, { status: 400 });
    }

    const command = await createCommand({
      input: body.input.trim(),
      sourceChannel: body.sourceChannel.trim(),
      requestedById: body.requestedById ?? null,
    });

    return NextResponse.json(command, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ route: 'POST /api/commands', error: message, timestamp: new Date().toISOString() }));
    return NextResponse.json({ message }, { status: 500 });
  }
}
