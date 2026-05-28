import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { dispatchCampaigns } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

/**
 * PATCH /api/projects/[id]
 *
 * Called by AssignCampaignModal in projects/page.tsx:
 *   body: { assignCampaignId: string }
 *
 * Sets campaign.projectId = project id.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json().catch(() => null);
    if (!body?.assignCampaignId) {
      return NextResponse.json({ error: 'assignCampaignId is required' }, { status: 400 });
    }

    await db
      .update(dispatchCampaigns)
      .set({ projectId: params.id })
      .where(eq(dispatchCampaigns.id, body.assignCampaignId));

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ route: `PATCH /api/projects/${params.id}`, error: message, timestamp: new Date().toISOString() }));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
