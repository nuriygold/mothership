import { type NextRequest, NextResponse } from 'next/server';
import { deleteGmailMessage } from '@/lib/services/email';
import { publishV2Event } from '@/lib/v2/event-bus';

export const dynamic = 'force-dynamic';

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
