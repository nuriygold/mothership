import { NextResponse } from 'next/server';
import { getDispatchCampaign } from '@/lib/services/dispatch';
import { prisma } from '@/lib/prisma';
import { createAuditEvent } from '@/lib/services/audit';

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
    const campaign = await prisma.dispatchCampaign.findUnique({
      where: { id: params.id },
      select: { id: true, title: true, status: true },
    });
    if (!campaign) {
      return NextResponse.json({ ok: false, message: 'Campaign not found' }, { status: 404 });
    }

    await prisma.dispatchCampaign.delete({ where: { id: campaign.id } });

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
