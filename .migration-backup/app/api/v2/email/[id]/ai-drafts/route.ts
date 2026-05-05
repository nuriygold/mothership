import { getV2EmailDrafts } from '@/lib/v2/orchestrator';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    return Response.json(await getV2EmailDrafts(params.id));
  } catch (error) {
    return Response.json(
      {
        error: {
          code: 'DRAFT_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to generate drafts',
        },
      },
      { status: 500 }
    );
  }
}

