import { type NextRequest, NextResponse } from 'next/server';
import { createCalendarEvent } from '@/lib/services/calendar';
import { getV2EmailFeed } from '@/lib/v2/orchestrator';
import { fetchGmailFullBody } from '@/lib/services/email';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailId = params.id;
  let body: { startDateTime?: string; endDateTime?: string; actionLinks?: Array<{ label: string; url: string }> } = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const feed = await getV2EmailFeed();
  const email = feed.inbox.find((item) => item.id === emailId);

  const title = email ? email.subject : `Event from email (${emailId})`;

  // Use action links from client if provided, otherwise fetch from email body
  let actionLinks = body.actionLinks ?? [];
  if (actionLinks.length === 0) {
    try {
      const fullBody = await fetchGmailFullBody(emailId);
      actionLinks = fullBody.actionLinks;
    } catch { /* ignore — calendar event still gets created */ }
  }

  const linksSection = actionLinks.length > 0
    ? `RSVP Links:\n${actionLinks.map(l => `• ${l.label}: ${l.url}`).join('\n')}\n\n---\n`
    : '';

  const description = `${linksSection}From: ${email?.sender ?? 'Unknown'}\n\n${email?.snippet ?? ''}`;

  // Default to tomorrow at noon if no start time provided
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(12, 0, 0, 0);
  const startDateTime = body.startDateTime ?? tomorrow.toISOString();

  const result = await createCalendarEvent({ title, description, startDateTime, endDateTime: body.endDateTime });

  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ ok: true, eventId: result.id, htmlLink: result.htmlLink, rsvpLinks: actionLinks });
}
