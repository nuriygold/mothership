import { ensureV2Authorized } from '@/lib/v2/auth';
import { getVisionItemWithLinks, linkCampaignToItem } from '@/lib/services/vision';
import { createDispatchCampaign } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;
  try {
    const item = await getVisionItemWithLinks(params.id);
    if (!item) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Vision item not found' } }, { status: 404 });
    }

    const campaign = await createDispatchCampaign({
      title: item.title,
      description: item.description
        ? `Vision: ${item.pillar?.label ?? 'Uncategorized'} — ${item.description}`
        : `Advance vision goal: ${item.title} (Pillar: ${item.pillar?.label ?? 'Uncategorized'})`,
    });

    await linkCampaignToItem(item.id, campaign.id);

    return Response.json({ campaignId: campaign.id, campaign }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: { code: 'DISPATCH_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}
