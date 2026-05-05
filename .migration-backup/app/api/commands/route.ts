import { NextResponse } from 'next/server';
import { createCommand, listCommands } from '@/lib/services/commands';

export async function GET() {
  const commands = await listCommands();
  return NextResponse.json(commands);
}

export async function POST(req: Request) {
  const body = await req.json();
  const command = await createCommand(body);
  return NextResponse.json({ command }, { status: 201 });
}
