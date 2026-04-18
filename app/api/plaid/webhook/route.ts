import { syncTransactionsForItem, markItemError } from '@/lib/services/plaid';
import { createFinanceEvent } from '@/lib/finance/events';
import { createHmac, timingSafeEqual } from 'crypto';

export const dynamic = 'force-dynamic';

function verifySignature(body: string, signatureHeader: string | null): boolean {
  const secret = process.env.PLAID_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return !secret; // skip verification if secret not configured
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  try {
    return timingSafeEqual(
      new Uint8Array(Buffer.from(signatureHeader)),
      new Uint8Array(Buffer.from(expected)),
    );
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();

  if (!verifySignature(rawBody, req.headers.get('plaid-verification'))) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    webhook_type: string;
    webhook_code: string;
    item_id: string;
    error?: { error_code?: string; error_type?: string };
  };

  const { webhook_type, webhook_code, item_id } = payload;

  if (webhook_type === 'TRANSACTIONS') {
    if (webhook_code === 'SYNC_UPDATES_AVAILABLE') {
      try {
        await syncTransactionsForItem(item_id);
      } catch {
        // sync failure is non-fatal for the webhook response
      }
    }
  }

  if (webhook_type === 'ITEM') {
    const errorCode = payload.error?.error_code ?? webhook_code;
    const loginRequired =
      payload.error?.error_type === 'ITEM_LOGIN_REQUIRED' ||
      webhook_code === 'USER_PERMISSION_REVOKED';

    if (webhook_code === 'ERROR' || webhook_code === 'USER_PERMISSION_REVOKED') {
      await markItemError(item_id, errorCode, loginRequired);
      await createFinanceEvent('ALERT', 'plaid', {
        priority: 'high',
        message: `Bank connection error for item ${item_id}: ${errorCode}`,
        itemId: item_id,
        loginRequired,
      });
    }
  }

  return Response.json({ received: true });
}
