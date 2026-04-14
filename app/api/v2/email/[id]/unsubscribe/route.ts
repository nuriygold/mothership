import { type NextRequest, NextResponse } from 'next/server';
import { getEmailListUnsubscribeUrl } from '@/lib/services/email';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailId = params.id;
  const url = await getEmailListUnsubscribeUrl(emailId);

  if (!url) {
    return NextResponse.json(
      { error: 'No List-Unsubscribe URL found in this email.' },
      { status: 404 }
    );
  }

  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    return NextResponse.json({ ok: true, url, status: res.status });
  } catch (err) {
    return NextResponse.json(
      { error: `Unsubscribe request failed: ${err instanceof Error ? err.message : String(err)}`, url },
      { status: 500 }
    );
  }
}
