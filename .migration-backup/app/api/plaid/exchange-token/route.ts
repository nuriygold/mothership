import { exchangePublicToken } from '@/lib/services/plaid';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { public_token, institution_name } = body as {
      public_token: string;
      institution_name?: string;
    };

    if (!public_token) {
      return Response.json({ error: 'public_token is required' }, { status: 400 });
    }

    const result = await exchangePublicToken(public_token, institution_name);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to exchange token' },
      { status: 500 },
    );
  }
}
