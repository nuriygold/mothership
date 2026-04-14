import { linkCampaignToItem, unlinkCampaignFromItem } from '@/lib/services/vision';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { campaignId } = await req.json();
    if (!campaignId) {
      return Response.json({ error: { code: 'MISSING_CAMPAIGN_ID', message: 'campaignId is required' } }, { status: 400 });
    }
    const link = await linkCampaignToItem(params.id, campaignId);
    return Response.json({ link }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: { code: 'LINK_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { campaignId } = await req.json();
    if (!campaignId) {
      return Response.json({ error: { code: 'MISSING_CAMPAIGN_ID', message: 'campaignId is required' } }, { status: 400 });
    }
    await unlinkCampaignFromItem(params.id, campaignId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: { code: 'UNLINK_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}
