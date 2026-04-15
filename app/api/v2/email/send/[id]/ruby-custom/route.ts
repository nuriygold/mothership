import { type NextRequest, NextResponse } from 'next/server';
import { getRubyDraftWithFallback, markDraftSent } from '@/lib/v2/orchestrator';
import { sendGmailReply, sendZohoReply } from '@/lib/services/email';
import { publishV2Event } from '@/lib/v2/event-bus';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {

  const emailId = params.id;
  const provider = process.env.EMAIL_PROVIDER || 'none';

  const draft = await getRubyDraftWithFallback(emailId);
  if (!draft) {
    return NextResponse.json(
      { error: 'Draft not found. Ruby may still be generating — retry in a moment.' },
      { status: 404 }
    );
  }

  let body: { to?: string; subject?: string; inReplyTo?: string; references?: string; overrideBody?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { to, subject, inReplyTo, references, overrideBody } = body;
  if (!to || !subject) {
    return NextResponse.json({ error: 'Missing required fields: to, subject.' }, { status: 400 });
  }

  let result;
  if (provider === 'gmail') {
    result = await sendGmailReply({ to, subject, body: overrideBody ?? draft.body, inReplyTo, references });
  } else if (provider === 'zoho') {
    result = await sendZohoReply({ to, subject, body: overrideBody ?? draft.body, inReplyTo, references });
  } else {
    result = { ok: false, error: `EMAIL_PROVIDER not configured. Set to 'gmail' or 'zoho'.` };
  }

  if (!result.ok) {
    publishV2Event(`email-drafts:${emailId}`, 'draft.send_failed', { emailId, draftId: draft.id, error: result.error });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await markDraftSent(emailId, draft.id);
  publishV2Event(`email-drafts:${emailId}`, 'draft.sent', { emailId, draftId: draft.id, messageId: result.messageId, to });
  publishV2Event('dashboard', 'email.reply_sent', { emailId, bot: 'Ruby', messageId: result.messageId });

  return NextResponse.json({ ok: true, messageId: result.messageId, emailId, draftId: draft.id });
}
