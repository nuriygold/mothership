import { listFinancePlans, createFinancePlan } from '@/lib/services/finance';
import { FinancePlanType, FinancePlanStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get('status');
    const status = statusParam && Object.values(FinancePlanStatus).includes(statusParam as FinancePlanStatus)
      ? (statusParam as FinancePlanStatus)
      : undefined;
    const plans = await listFinancePlans(status);
    return Response.json({ plans });
  } catch (error) {
    return Response.json(
      { error: { code: 'FINANCE_PLANS_FETCH_FAILED', message: error instanceof Error ? error.message : 'Failed to load finance plans' } },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const plan = await createFinancePlan({
      title: body.title,
      type: body.type as FinancePlanType | undefined,
      status: body.status as FinancePlanStatus | undefined,
      description: body.description,
      goal: body.goal,
      currentValue: body.currentValue != null ? Number(body.currentValue) : undefined,
      targetValue: body.targetValue != null ? Number(body.targetValue) : undefined,
      unit: body.unit,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      targetDate: body.targetDate ? new Date(body.targetDate) : undefined,
      managedByBot: body.managedByBot,
      milestones: body.milestones,
      notes: body.notes,
      sourceFile: body.sourceFile,
    });
    return Response.json({ plan }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: { code: 'FINANCE_PLAN_CREATE_FAILED', message: error instanceof Error ? error.message : 'Failed to create finance plan' } },
      { status: 500 }
    );
  }
}
