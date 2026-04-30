import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { dispatchCampaigns, dispatchTasks } from '@/lib/db/schema';
import { DispatchCampaignStatus } from '@/lib/db/enums';
import { createAuditEvent } from '@/lib/services/audit';
import { writeCampaignOutput, pingTelegramCampaignComplete } from '@/lib/services/campaign-output';

export const dynamic = 'force-dynamic';

/**
 * Marks a dispatch campaign COMPLETED and drops it in the Trophy Case.
 * Idempotent: calling twice is a no-op after the first call.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const [campaign] = await db
      .select()
      .from(dispatchCampaigns)
      .where(eq(dispatchCampaigns.id, params.id))
      .limit(1);
    if (!campaign) {
      return NextResponse.json({ ok: false, message: 'Campaign not found' }, { status: 404 });
    }

    const tasks = await db
      .select({ status: dispatchTasks.status })
      .from(dispatchTasks)
      .where(eq(dispatchTasks.campaignId, campaign.id));

    const wasAlreadyComplete = campaign.status === DispatchCampaignStatus.COMPLETED;

    if (!wasAlreadyComplete) {
      await db
        .update(dispatchCampaigns)
        .set({ status: DispatchCampaignStatus.COMPLETED, updatedAt: new Date() })
        .where(eq(dispatchCampaigns.id, campaign.id));
    }

    // Write output files and ping Telegram (non-fatal, deduplicated on repeat calls)
    writeCampaignOutput(campaign.id).catch(() => { /* non-fatal */ });
    if (!wasAlreadyComplete) {
      pingTelegramCampaignComplete({
        id: campaign.id,
        title: campaign.title,
        status: DispatchCampaignStatus.COMPLETED,
        tasks,
      }).catch(() => { /* non-fatal */ });
    }

    await createAuditEvent({
      entityType: 'DispatchCampaign',
      entityId: campaign.id,
      eventType: 'TROPHIED',
      actorId: 'user',
      metadata: {
        description: `Campaign "${campaign.title}" moved to the Trophy Case`,
        title: campaign.title,
        previousStatus: campaign.status,
        category: 'Campaigns',
      },
    }).catch(() => { /* audit is best-effort */ });

    return NextResponse.json({ ok: true, id: campaign.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
