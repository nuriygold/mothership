import { type NextRequest, NextResponse } from 'next/server';
import { deleteGmailMessage } from '@/lib/services/email';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const result = await deleteGmailMessage(params.id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
