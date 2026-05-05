import { type NextRequest, NextResponse } from 'next/server';
import { deleteGmailMessage, fetchGmailFullBody, fetchZohoFullBody } from '@/lib/services/email';
import { publishV2Event } from '@/lib/v2/event-bus';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailId = params.id;
  const provider = (process.env.EMAIL_PROVIDER || 'gmail') as string;

  try {
    // Zoho UIDs are numeric; Gmail IDs are alphanumeric hex strings
    if (provider === 'zoho') {
      const body = await fetchZohoFullBody(emailId);
      return NextResponse.json({ ok: true, ...body });
    }
    // Default to Gmail (also handles 'both' — Gmail IDs are used for both-provider previews)
    const body = await fetchGmailFullBody(emailId);
    return NextResponse.json({ ok: true, ...body });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailId = params.id;
  const result = await deleteGmailMessage(emailId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  publishV2Event('dashboard', 'email.deleted', { emailId });
  return NextResponse.json({ ok: true, emailId });
}
