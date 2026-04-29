/**
 * MerchantProfile service
 *
 * Maintains a learned registry of merchants → categories.
 * The key contract:
 *   - First transaction from a merchant  → upsert profile (count=1), no category yet
 *   - Subsequent transactions            → increment count + update lastSeen
 *   - Once a category is set             → all future transactions auto-categorize
 */

import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { and, desc, eq, sql as drizzleSql } from 'drizzle-orm';
import { runSubscriptionDetection } from '@/lib/finance/subscriptionDetector';
import { randomUUID } from 'node:crypto';

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

  const [existing] = await db.select()
    .from(schema.merchantProfiles)
    .where(eq(schema.merchantProfiles.merchantName, merchantName))
    .limit(1);

  if (existing) {
    // Bump count + lastSeen regardless of whether we have a category
    const [updated] = await db.update(schema.merchantProfiles)
      .set({
        transactionCount: drizzleSql`${schema.merchantProfiles.transactionCount} + 1`,
        lastSeen: new Date(),
      })
      .where(eq(schema.merchantProfiles.merchantName, merchantName))
      .returning();

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
  await db.insert(schema.merchantProfiles).values({
    id: randomUUID(),
    merchantName,
    defaultCategory: null,
    isSubscription: false,
    transactionCount: 1,
    lastSeen: new Date(),
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

  return db.insert(schema.merchantProfiles)
    .values({
      id: randomUUID(),
      merchantName,
      defaultCategory: category.trim().toLowerCase(),
      isSubscription: isSubscription ?? false,
      transactionCount: 0,
      lastSeen: new Date(),
    })
    .onConflictDoUpdate({
      target: schema.merchantProfiles.merchantName,
      set: {
        defaultCategory: category.trim().toLowerCase(),
        ...(isSubscription !== undefined && { isSubscription }),
        lastSeen: new Date(),
      }
    })
    .returning();
}

/**
 * List all merchant profiles, newest first.
 */
export async function listMerchantProfiles(opts: {
  uncategorizedOnly?: boolean;
  limit?: number;
} = {}) {
  const where = opts.uncategorizedOnly ? drizzleSql`${schema.merchantProfiles.defaultCategory} IS NULL` : undefined;
  return db.select()
    .from(schema.merchantProfiles)
    .where(where)
    .orderBy(desc(schema.merchantProfiles.lastSeen))
    .limit(opts.limit ?? 100);
}
