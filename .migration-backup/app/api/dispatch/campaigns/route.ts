import { NextResponse } from 'next/server';
import { createDispatchCampaign, listDispatchCampaigns } from '@/lib/services/dispatch';

export const dynamic = 'force-dynamic';

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s ? s : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

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
      description: optionalString(body?.description),
      costBudgetCents: optionalNumber(body?.costBudgetCents),
      timeBudgetSeconds: optionalNumber(body?.timeBudgetSeconds),
      callbackUrl: optionalString(body?.callbackUrl),
      callbackSecret: optionalString(body?.callbackSecret),
      projectId: optionalString(body?.projectId),
      visionItemId: optionalString(body?.visionItemId),
      outputFolder: optionalString(body?.outputFolder),
      assignedBotId: optionalString(body?.assignedBotId),
      revenueStream: optionalString(body?.revenueStream),
      linkedTaskRef: optionalString(body?.linkedTaskRef),
    });

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    const err = error as any;
    const message = err?.message ?? String(error);
    const status = message.startsWith('Unknown project "') ? 400 : 500;
    console.error('[dispatch] create campaign failed', {
      message,
      code: err?.code,
      detail: err?.detail,
      constraint: err?.constraint,
      table: err?.table_name ?? err?.table,
      column: err?.column_name ?? err?.column,
    });
    return NextResponse.json(
      {
        ok: false,
        message,
        code: err?.code,
        detail: err?.detail,
        constraint: err?.constraint,
        table: err?.table_name ?? err?.table,
        column: err?.column_name ?? err?.column,
      },
      { status }
    );
  }
}
