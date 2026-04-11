import { ensureV2Authorized } from '@/lib/v2/auth';
import {
  listMerchantProfiles,
  categorizeMerchant,
  normalizeMerchantName,
} from '@/lib/finance/merchantProfile';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/v2/finance/merchants?uncategorized=true
export async function GET(req: Request) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const uncategorizedOnly = searchParams.get('uncategorized') === 'true';
    const merchants = await listMerchantProfiles({ uncategorizedOnly });
    return Response.json({ merchants });
  } catch (error) {
    return Response.json(
      { error: { code: 'MERCHANTS_FETCH_FAILED', message: error instanceof Error ? error.message : 'Failed to fetch merchants' } },
      { status: 500 }
    );
  }
}

// PATCH /api/v2/finance/merchants
//
// Three operations via body.action:
//
// 1. Categorize (default, no action field needed):
//    { merchantName, category, isSubscription? }
//
// 2. Confirm subscription:
//    { merchantName, action: "confirm-subscription", eventId }
//
// 3. Ignore subscription:
//    { merchantName, action: "ignore-subscription", eventId }
//
export async function PATCH(req: Request) {
  const authError = ensureV2Authorized(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const merchantName = typeof body.merchantName === 'string' ? body.merchantName.trim() : '';
    const action       = typeof body.action       === 'string' ? body.action               : 'categorize';
    const eventId      = typeof body.eventId      === 'string' ? body.eventId              : null;

    if (!merchantName) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'merchantName is required' } },
        { status: 400 }
      );
    }

    // ── Confirm subscription ─────────────────────────────────────────────────
    if (action === 'confirm-subscription') {
      const merchant = await prisma.merchantProfile.update({
        where: { merchantName: normalizeMerchantName(merchantName) },
        data: { isSubscription: true, subscriptionConfirmed: true },
      });

      if (eventId) {
        await prisma.financeEvent.update({
          where: { id: eventId },
          data: { resolved: true },
        });
      }

      return Response.json({ merchant, action: 'confirmed' });
    }

    // ── Ignore / dismiss subscription detection ───────────────────────────────
    if (action === 'ignore-subscription') {
      // Roll back isSubscription so it won't re-trigger immediately,
      // but keep transactionCount so future data can be re-evaluated later.
      const merchant = await prisma.merchantProfile.update({
        where: { merchantName: normalizeMerchantName(merchantName) },
        data: { isSubscription: false, billingInterval: null, subscriptionConfirmed: false },
      });

      if (eventId) {
        await prisma.financeEvent.update({
          where: { id: eventId },
          data: { resolved: true },
        });
      }

      return Response.json({ merchant, action: 'ignored' });
    }

    // ── Categorize (default) ─────────────────────────────────────────────────
    const category       = typeof body.category       === 'string' ? body.category.trim()       : '';
    const isSubscription = typeof body.isSubscription === 'boolean' ? body.isSubscription : undefined;

    if (!category) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'category is required' } },
        { status: 400 }
      );
    }

    const merchant = await categorizeMerchant(merchantName, category, isSubscription);

    // Auto-resolve open TRANSACTION_DETECTED events for this merchant
    const normalized = normalizeMerchantName(merchantName);
    const resolved = await prisma.financeEvent.updateMany({
      where: {
        type: 'TRANSACTION_DETECTED',
        resolved: false,
        OR: [
          { payload: { path: ['description'], equals: normalized } },
          { payload: { path: ['description'], equals: merchantName } },
        ],
      },
      data: { resolved: true },
    });

    return Response.json({ merchant, resolvedEvents: resolved.count });
  } catch (error) {
    return Response.json(
      { error: { code: 'MERCHANT_UPDATE_FAILED', message: error instanceof Error ? error.message : 'Failed to update merchant' } },
      { status: 500 }
    );
  }
}
