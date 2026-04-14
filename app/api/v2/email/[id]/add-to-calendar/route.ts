import { type NextRequest, NextResponse } from 'next/server';
import { createCalendarEvent } from '@/lib/services/calendar';
import { getV2EmailFeed } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailId = params.id;
  let body: { startDateTime?: string; endDateTime?: string } = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const feed = await getV2EmailFeed();
  const email = feed.inbox.find((item) => item.id === emailId);

  const title = email ? email.subject : `Event from email (${emailId})`;
  const description = email ? `From: ${email.sender}\n\n${email.snippet ?? ''}` : undefined;

  // Default to tomorrow at 10am if no start time provided
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const startDateTime = body.startDateTime ?? tomorrow.toISOString();

  const result = await createCalendarEvent({ title, description, startDateTime, endDateTime: body.endDateTime });

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eventId: result.id, htmlLink: result.htmlLink });
}
