import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DispatchCampaignStatus } from '@/lib/db/prisma-types';
import { createAuditEvent } from '@/lib/services/audit';
import { writeCampaignOutput, pingTelegramCampaignComplete } from '@/lib/services/campaign-output';

export const dynamic = 'force-dynamic';

/**
 * Marks a dispatch campaign COMPLETED and drops it in the Trophy Case.
 * Idempotent: calling twice is a no-op after the first call.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const campaign = await prisma.dispatchCampaign.findUnique({
      where: { id: params.id },
      include: { tasks: { select: { status: true } } },
    });
    if (!campaign) {
      return NextResponse.json({ ok: false, message: 'Campaign not found' }, { status: 404 });
    }

    const wasAlreadyComplete = campaign.status === DispatchCampaignStatus.COMPLETED;

    if (!wasAlreadyComplete) {
      await prisma.dispatchCampaign.update({
        where: { id: campaign.id },
        data: { status: DispatchCampaignStatus.COMPLETED },
      });
    }

    // Write output files and ping Telegram (non-fatal, deduplicated on repeat calls)
    writeCampaignOutput(campaign.id).catch(() => { /* non-fatal */ });
    if (!wasAlreadyComplete) {
      pingTelegramCampaignComplete({
        id: campaign.id,
        title: campaign.title,
        status: DispatchCampaignStatus.COMPLETED,
        tasks: campaign.tasks,
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
