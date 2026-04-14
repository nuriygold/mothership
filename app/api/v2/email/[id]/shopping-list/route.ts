import { type NextRequest, NextResponse } from 'next/server';
import { addShoppingItem } from '@/lib/services/shopping';
import { getV2EmailFeed } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailId = params.id;
  let body: { name?: string; notes?: string } = {};
  try { body = await req.json(); } catch { /* use defaults */ }

  const feed = await getV2EmailFeed();
  const email = feed.inbox.find((item) => item.id === emailId);

  const name = body.name?.trim() || (email ? email.subject : `Item from email ${emailId}`);
  const notes = body.notes ?? (email ? `From: ${email.sender}` : undefined);

  const item = await addShoppingItem({
    name,
    notes,
    source: 'email',
    emailId,
    emailSubject: email?.subject,
  });

  return NextResponse.json({ ok: true, item });
}
