import { NextResponse } from 'next/server';
import { createDispatchCampaign, listDispatchCampaigns } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const campaigns = await listDispatchCampaigns();
    return NextResponse.json(campaigns);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : 'Failed to load dispatch campaigns',
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = String(body?.title ?? '').trim();

    if (!title) {
      return NextResponse.json({ ok: false, message: 'Title is required' }, { status: 400 });
    }

    const campaign = await createDispatchCampaign({
      title,
      description: body?.description ? String(body.description) : undefined,
      costBudgetCents:
        body?.costBudgetCents !== undefined && body.costBudgetCents !== null
          ? Number(body.costBudgetCents)
          : undefined,
      timeBudgetSeconds:
        body?.timeBudgetSeconds !== undefined && body.timeBudgetSeconds !== null
          ? Number(body.timeBudgetSeconds)
          : undefined,
      callbackUrl: body?.callbackUrl ? String(body.callbackUrl) : undefined,
      callbackSecret: body?.callbackSecret ? String(body.callbackSecret) : undefined,
      projectId: body?.projectId ? String(body.projectId) : undefined,
      visionItemId: body?.visionItemId ? String(body.visionItemId) : undefined,
      outputFolder: body?.outputFolder ? String(body.outputFolder) : undefined,
      assignedBotId: body?.assignedBotId ? String(body.assignedBotId) : undefined,
      revenueStream: body?.revenueStream ? String(body.revenueStream) : undefined,
      linkedTaskRef: body?.linkedTaskRef ? String(body.linkedTaskRef) : undefined,
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, message: String(error) }, { status: 500 });
  }
}
