import { type NextRequest, NextResponse } from 'next/server';
import { createDispatchCampaign } from '@/lib/services/dispatch';
import { getV2EmailFeed } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailId = params.id;

  const feed = await getV2EmailFeed();
  const email = feed.inbox.find((item) => item.id === emailId);

  const title = email ? `Handle email: ${email.subject}` : `Email campaign (${emailId})`;
  const description = email
    ? `Dispatch campaign created from email.\nFrom: ${email.sender}\nSubject: ${email.subject}\n\n${email.snippet ?? ''}`
    : undefined;

  const campaign = await createDispatchCampaign({ title, description });
  return NextResponse.json({ ok: true, campaignId: campaign.id, title: campaign.title });
}
