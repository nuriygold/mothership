import { NextResponse } from 'next/server';
import { getDispatchCampaign } from '@/lib/services/dispatch';
import { createAuditEvent } from '@/lib/services/audit';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { dispatchCampaigns, dispatchTasks } from '@/lib/db/schema';

export const dynamic = 'force-dynamic';

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const campaign = await getDispatchCampaign(params.id);
  if (!campaign) {
    return NextResponse.json({ ok: false, message: 'Campaign not found' }, { status: 404 });
  }

  return NextResponse.json(campaign);
}

/**
 * Deletes a dispatch campaign. Tasks cascade via Prisma relation.
 * A reason is optional but encouraged — it's persisted on the audit event
 * so the Activity log shows *why* the campaign was removed.
 */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  let reason = '';
  try {
    const body = await req.json();
    reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
  } catch { /* no body is fine */ }

  try {
    const [campaign] = await db
      .select({ id: dispatchCampaigns.id, title: dispatchCampaigns.title, status: dispatchCampaigns.status })
      .from(dispatchCampaigns)
      .where(eq(dispatchCampaigns.id, params.id))
      .limit(1);
    if (!campaign) {
      return NextResponse.json({ ok: false, message: 'Campaign not found' }, { status: 404 });
    }

    // Be explicit: delete tasks first, then campaign (works regardless of FK cascade).
    await db.delete(dispatchTasks).where(eq(dispatchTasks.campaignId, campaign.id));
    await db.delete(dispatchCampaigns).where(eq(dispatchCampaigns.id, campaign.id));

    await createAuditEvent({
      entityType: 'DispatchCampaign',
      entityId: campaign.id,
      eventType: 'DELETED',
      actorId: 'user',
      metadata: {
        description: `Campaign "${campaign.title}" deleted${reason ? ` — ${reason}` : ''}`,
        title: campaign.title,
        previousStatus: campaign.status,
        reason: reason || null,
        category: 'Campaigns',
      },
    }).catch(() => { /* audit is best-effort; deletion already succeeded */ });

    return NextResponse.json({ ok: true, id: campaign.id, reason });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
