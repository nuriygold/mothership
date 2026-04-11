/**
 * MerchantProfile service
 *
 * Maintains a learned registry of merchants → categories.
 * The key contract:
 *   - First transaction from a merchant  → upsert profile (count=1), no category yet
 *   - Subsequent transactions            → increment count + update lastSeen
 *   - Once a category is set             → all future transactions auto-categorize
 */

import { prisma } from '@/lib/prisma';
import { runSubscriptionDetection } from '@/lib/finance/subscriptionDetector';

// Normalize merchant names before storing / looking up:
// "  UBER* TRIP  " → "uber* trip"
export function normalizeMerchantName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export type MerchantLookupResult =
  | { found: true;  category: string;  isSubscription: boolean }
  | { found: true;  category: null;    isSubscription: boolean }
  | { found: false };

/**
 * Look up a merchant and bump its counters.
 * If the merchant doesn't exist yet, create a stub record with no category.
 * Returns the current defaultCategory (null if uncategorized).
 */
export async function touchMerchant(rawName: string): Promise<MerchantLookupResult> {
  const merchantName = normalizeMerchantName(rawName);
  if (!merchantName) return { found: false };

  const existing = await prisma.merchantProfile.findUnique({
    where: { merchantName },
  });

  if (existing) {
    // Bump count + lastSeen regardless of whether we have a category
    const updated = await prisma.merchantProfile.update({
      where: { merchantName },
      data: {
        transactionCount: { increment: 1 },
        lastSeen: new Date(),
      },
    });

    // Run subscription detection once we have enough data, fire-and-forget
    if (updated.transactionCount >= 3 && !updated.isSubscription) {
      runSubscriptionDetection(rawName).catch(() => {});
    }

    return {
      found: true,
      category: existing.defaultCategory ?? null,
      isSubscription: existing.isSubscription,
    };
  }

  // First time seeing this merchant — create stub, leave category null
  await prisma.merchantProfile.create({
    data: {
      merchantName,
      defaultCategory: null,
      isSubscription: false,
      transactionCount: 1,
      lastSeen: new Date(),
    },
  });

  return { found: false };
}

/**
 * Set (or update) the category for a merchant.
 * After this, all future transactions from that merchant auto-categorize.
 */
export async function categorizeMerchant(
  rawName: string,
  category: string,
  isSubscription?: boolean
) {
  const merchantName = normalizeMerchantName(rawName);

  return prisma.merchantProfile.upsert({
    where: { merchantName },
    update: {
      defaultCategory: category.trim().toLowerCase(),
      ...(isSubscription !== undefined && { isSubscription }),
      lastSeen: new Date(),
    },
    create: {
      merchantName,
      defaultCategory: category.trim().toLowerCase(),
      isSubscription: isSubscription ?? false,
      transactionCount: 0,
      lastSeen: new Date(),
    },
  });
}

/**
 * List all merchant profiles, newest first.
 */
export async function listMerchantProfiles(opts: {
  uncategorizedOnly?: boolean;
  limit?: number;
} = {}) {
  return prisma.merchantProfile.findMany({
    where: opts.uncategorizedOnly ? { defaultCategory: null } : undefined,
    orderBy: { lastSeen: 'desc' },
    take: opts.limit ?? 100,
  });
}
