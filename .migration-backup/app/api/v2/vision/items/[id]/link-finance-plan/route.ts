import { linkFinancePlanToItem, unlinkFinancePlanFromItem } from '@/lib/services/vision';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { financePlanId } = await req.json();
    if (!financePlanId) {
      return Response.json({ error: { code: 'MISSING_PLAN_ID', message: 'financePlanId is required' } }, { status: 400 });
    }
    const link = await linkFinancePlanToItem(params.id, financePlanId);
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
    const { financePlanId } = await req.json();
    if (!financePlanId) {
      return Response.json({ error: { code: 'MISSING_PLAN_ID', message: 'financePlanId is required' } }, { status: 400 });
    }
    await unlinkFinancePlanFromItem(params.id, financePlanId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: { code: 'UNLINK_FAILED', message: error instanceof Error ? error.message : 'Failed' } },
      { status: 500 }
    );
  }
}
