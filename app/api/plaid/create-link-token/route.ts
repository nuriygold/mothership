import { createLinkToken } from '@/lib/services/plaid';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const linkToken = await createLinkToken();
    return Response.json({ link_token: linkToken });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to create link token' },
      { status: 500 },
    );
  }
}
