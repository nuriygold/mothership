import { type NextRequest, NextResponse } from 'next/server';
import { deterministicTemplateDrafts, getV2EmailFeed, markDraftSent } from '@/lib/v2/orchestrator';
import { sendGmailReply, sendZohoReply } from '@/lib/services/email';
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
  const provider = process.env.EMAIL_PROVIDER || 'none';

  const feed = await getV2EmailFeed();
  const email = feed.inbox.find((item) => item.id === emailId);
  if (!email) {
    return NextResponse.json({ error: 'Email not found in inbox.' }, { status: 404 });
  }

  const drafts = deterministicTemplateDrafts(emailId, email.subject);
  const draft = drafts.find((d) => d.tone === 'Measured');
  if (!draft) {
    return NextResponse.json({ error: 'Measured draft could not be generated.' }, { status: 500 });
  }

  const to = extractEmail(email.sender);

  // Allow overrideBody from request (for edited drafts)
  let overrideBody: string | undefined;
  try {
    const body = await req.json();
    overrideBody = body.overrideBody;
  } catch {
    // No request body, use default draft.body
  }

  const draftBody = overrideBody ?? draft.body;

  let result;
  if (provider === 'gmail') {
    result = await sendGmailReply({ to, subject: email.subject, body: draftBody });
  } else if (provider === 'zoho') {
    result = await sendZohoReply({ to, subject: email.subject, body: draftBody });
  } else {
    result = { ok: false, error: `EMAIL_PROVIDER not configured. Set to 'gmail' or 'zoho'.` };
  }

  if (!result.ok) {
    publishV2Event(`email-drafts:${emailId}`, 'draft.send_failed', { emailId, draftId: draft.id, error: result.error });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await markDraftSent(emailId);
  publishV2Event(`email-drafts:${emailId}`, 'draft.sent', { emailId, draftId: draft.id, messageId: result.messageId, to });
  publishV2Event('dashboard', 'email.reply_sent', { emailId, bot: 'Ruby', tone: 'Measured', messageId: result.messageId });

  return NextResponse.json({ ok: true, messageId: result.messageId, emailId, draftId: draft.id });
}
