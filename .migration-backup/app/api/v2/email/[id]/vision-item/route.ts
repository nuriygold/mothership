import { type NextRequest, NextResponse } from 'next/server';
import { createVisionItem, getOrCreateVisionBoard, listVisionPillars } from '@/lib/services/vision';
import { getV2EmailFeed } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailId = params.id;

  const feed = await getV2EmailFeed();
  const email = feed.inbox.find((item) => item.id === emailId);

  const title = email ? email.subject : `Email item (${emailId})`;
  const description = email ? `From: ${email.sender}\n\n${email.snippet ?? ''}` : undefined;

  // Find first available pillar, fall back to creating item on first pillar of board
  const board = await getOrCreateVisionBoard();
  const pillars = await listVisionPillars(board.id);
  if (!pillars.length) {
    return NextResponse.json({ error: 'No vision pillars found. Create a pillar first.' }, { status: 400 });
  }

  const pillar = pillars[0];
  const item = await createVisionItem(pillar.id, { title, description });
  return NextResponse.json({ ok: true, item, pillarLabel: pillar.label });
}
