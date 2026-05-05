import { type NextRequest, NextResponse } from 'next/server';
import { sendZohoReply, sendGmailReply } from '@/lib/services/email';
import { getV2EmailFeed } from '@/lib/v2/orchestrator';
import { publishV2Event } from '@/lib/v2/event-bus';

export const dynamic = 'force-dynamic';

function extractEmail(sender: string): string {
  const match = sender.match(/<([^>]+)>/);
  return match ? match[1] : sender.trim();
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailId = params.id;

  let body: { to?: string; bodyText?: string; inReplyTo?: string; references?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.bodyText?.trim()) {
    return NextResponse.json({ error: 'bodyText is required.' }, { status: 400 });
  }

  // Derive recipient + subject from the inbox if not explicitly provided
  const feed = await getV2EmailFeed();
  const email = feed.inbox.find((item) => item.id === emailId);
  const to = body.to ?? (email ? extractEmail(email.sender) : undefined);
  const subject = email?.subject ?? 'Re: (no subject)';

  if (!to) {
    return NextResponse.json({ error: 'Could not determine recipient. Pass `to` explicitly.' }, { status: 400 });
  }

  // Choose sender based on configured provider
  const provider = (process.env.EMAIL_PROVIDER ?? 'gmail').toLowerCase();
  const sendFn = provider === 'zoho' ? sendZohoReply : sendGmailReply;

  const result = await sendFn({
    to,
    subject,
    body: body.bodyText,
    inReplyTo: body.inReplyTo,
    references: body.references,
  });

  if (!result.ok) {
    publishV2Event(`email-drafts:${emailId}`, 'draft.send_failed', { emailId, error: result.error });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  publishV2Event(`email-drafts:${emailId}`, 'draft.sent', { emailId, messageId: result.messageId, to });
  publishV2Event('dashboard', 'email.reply_sent', { emailId, bot: 'manual', messageId: result.messageId });

  return NextResponse.json({ ok: true, messageId: result.messageId, to });
}
