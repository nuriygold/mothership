import { NextResponse } from 'next/server';
import { createCommand, listCommands } from '@/lib/services/commands';
import { publishV2Event } from '@/lib/v2/event-bus';

export async function GET() {
  const commands = await listCommands();
  return NextResponse.json(commands);
}

export async function POST(req: Request) {
  const body = await req.json();
  const command = await createCommand(body);
  publishV2Event('kissin-booth', 'command.received', {
    id: command.id,
    input: command.input,
    status: command.status,
    sourceChannel: command.sourceChannel,
  });
  return NextResponse.json({ command }, { status: 201 });
}
