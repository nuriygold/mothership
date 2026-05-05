import { getV2FinanceOverview } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    return Response.json(await getV2FinanceOverview());
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'FINANCE_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to load finance overview',
        },
      },
      { status: 500 }
    );
  }
}

