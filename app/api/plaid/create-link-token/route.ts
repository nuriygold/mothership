import { createLinkToken, getAccessTokenForItem } from '@/lib/services/plaid';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { itemId } = body as { itemId?: string };

    let updateAccessToken: string | undefined;
    if (itemId) {
      updateAccessToken = await getAccessTokenForItem(itemId);
    }

    const linkToken = await createLinkToken(updateAccessToken);
    return Response.json({ link_token: linkToken });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to create link token' },
      { status: 500 },
    );
  }
}
