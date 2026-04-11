/**
 * Anomaly Detector — Phase 7
 *
 * Three detectors, each fire-and-forget after a transaction is ingested:
 *
 *   1. UNUSUAL_CHARGE         — single charge > 2× merchant median
 *   2. SUBSCRIPTION_PRICE_CHANGE — subscription charge increased > 15% vs median
 *   3. CATEGORY_SPIKE         — current week spend > 2× 4-week rolling average
 *
 * All detectors are deduplicated: one open event per (merchant|category, type)
 * at a time, so the Action Feed doesn't flood on repeated triggers.
 */

import { prisma } from '@/lib/prisma';
import { createFinanceEvent } from '@/lib/finance/events';
import { normalizeMerchantName } from '@/lib/finance/merchantProfile';

// ─── Thresholds ────────────────────────────────────────────────────────────────

const UNUSUAL_CHARGE_MULTIPLIER      = 2.0;   // charge > 2× merchant median
const SUBSCRIPTION_DRIFT_THRESHOLD   = 0.15;  // > 15% price increase
const CATEGORY_SPIKE_MULTIPLIER      = 2.0;   // this week > 2× 4-week avg
const MIN_HISTORY_FOR_MEDIAN         = 3;     // need at least 3 prior charges

// ─── Shared helpers ───────────────────────────────────────────────────────────

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // Sunday
  return d;
}

function weeksAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n * 7);
  return d;
}

/**
 * Check if an open (unresolved) anomaly event already exists for this
 * merchant / category so we don't spam the Action Feed.
 */
async function hasOpenEvent(
  type: string,
  payloadKey: 'merchant' | 'categoryName',
  value: string
): Promise<boolean> {
  const existing = await prisma.financeEvent.findFirst({
    where: {
      type,
      resolved: false,
      payload: { path: [payloadKey], equals: value },
    },
  });
  return existing !== null;
}

// ─── 1. Unusual charge ────────────────────────────────────────────────────────

export async function detectUnusualCharge(
  merchantName: string,
  newAmount: number   // absolute value (positive)
): Promise<void> {
  try {
    const normalized = normalizeMerchantName(merchantName);

    // Fetch prior transactions for this merchant (excluding the most recent)
    const history = await prisma.transaction.findMany({
      where: {
        description: { equals: normalized, mode: 'insensitive' },
        amount: { lt: 0 },
      },
      orderBy: { occurredAt: 'desc' },
      take: 20,
      select: { amount: true },
    });

    // Drop the newest entry (the one we're currently evaluating)
    const prior = history.slice(1).map((t) => Math.abs(t.amount));

    if (prior.length < MIN_HISTORY_FOR_MEDIAN) return;

    const typicalAmount = median(prior);
    if (typicalAmount <= 0) return;

    if (newAmount <= typicalAmount * UNUSUAL_CHARGE_MULTIPLIER) return;

    if (await hasOpenEvent('UNUSUAL_CHARGE', 'merchant', normalized)) return;

    await createFinanceEvent('UNUSUAL_CHARGE', 'anomaly-detector', {
      merchant:      normalized,
      amount:        newAmount,
      typicalAmount: Math.round(typicalAmount * 100) / 100,
      multiplier:    Math.round((newAmount / typicalAmount) * 10) / 10,
      priority:      'high',
    });

    console.log(
      `[anomaly:UNUSUAL_CHARGE] ${normalized} — $${newAmount} vs typical $${typicalAmount.toFixed(2)}`
    );
  } catch (err) {
    console.error('[anomaly:detectUnusualCharge]', err);
  }
}

// ─── 2. Subscription price change ────────────────────────────────────────────

export async function detectSubscriptionPriceChange(
  merchantName: string,
  newAmount: number
): Promise<void> {
  try {
    const normalized = normalizeMerchantName(merchantName);

    // Only run for confirmed subscription merchants
    const profile = await prisma.merchantProfile.findUnique({
      where: { merchantName: normalized },
      select: { isSubscription: true, subscriptionConfirmed: true },
    });
    if (!profile?.isSubscription) return;

    const history = await prisma.transaction.findMany({
      where: {
        description: { equals: normalized, mode: 'insensitive' },
        amount: { lt: 0 },
      },
      orderBy: { occurredAt: 'desc' },
      take: 12,
      select: { amount: true },
    });

    const prior = history.slice(1).map((t) => Math.abs(t.amount));
    if (prior.length < MIN_HISTORY_FOR_MEDIAN) return;

    const oldAmount = median(prior);
    if (oldAmount <= 0) return;

    const changePct = (newAmount - oldAmount) / oldAmount;
    if (changePct <= SUBSCRIPTION_DRIFT_THRESHOLD) return;

    if (await hasOpenEvent('SUBSCRIPTION_PRICE_CHANGE', 'merchant', normalized)) return;

    await createFinanceEvent('SUBSCRIPTION_PRICE_CHANGE', 'anomaly-detector', {
      merchant:   normalized,
      oldAmount:  Math.round(oldAmount * 100) / 100,
      newAmount,
      changePct:  Math.round(changePct * 1000) / 10,   // e.g. 33.4 (%)
      priority:   'normal',
    });

    console.log(
      `[anomaly:SUBSCRIPTION_PRICE_CHANGE] ${normalized} — $${oldAmount.toFixed(2)} → $${newAmount} (+${(changePct * 100).toFixed(1)}%)`
    );
  } catch (err) {
    console.error('[anomaly:detectSubscriptionPriceChange]', err);
  }
}

// ─── 3. Category spending spike ───────────────────────────────────────────────

export async function detectCategorySpike(category: string): Promise<void> {
  try {
    if (!category || category === 'general') return;

    const weekStart   = startOfWeek(new Date());
    const fourWeeksAgo = weeksAgo(4);

    // Current week spend for this category
    const thisWeekTxs = await prisma.transaction.findMany({
      where: {
        category: { equals: category, mode: 'insensitive' },
        amount: { lt: 0 },
        occurredAt: { gte: weekStart },
      },
      select: { amount: true },
    });
    const thisWeekSpend = thisWeekTxs.reduce((s, t) => s + Math.abs(t.amount), 0);
    if (thisWeekSpend === 0) return;

    // Historical weekly totals — last 4 complete weeks
    const historicalTxs = await prisma.transaction.findMany({
      where: {
        category: { equals: category, mode: 'insensitive' },
        amount: { lt: 0 },
        occurredAt: { gte: fourWeeksAgo, lt: weekStart },
      },
      select: { amount: true, occurredAt: true },
    });

    if (historicalTxs.length === 0) return;

    // Bucket into weeks
    const weekBuckets: Record<string, number> = {};
    for (const tx of historicalTxs) {
      const ws = startOfWeek(new Date(tx.occurredAt)).toISOString();
      weekBuckets[ws] = (weekBuckets[ws] ?? 0) + Math.abs(tx.amount);
    }

    const weeklyTotals = Object.values(weekBuckets);
    if (weeklyTotals.length === 0) return;

    const avgWeeklySpend = weeklyTotals.reduce((s, v) => s + v, 0) / weeklyTotals.length;
    if (avgWeeklySpend <= 0) return;

    if (thisWeekSpend <= avgWeeklySpend * CATEGORY_SPIKE_MULTIPLIER) return;

    if (await hasOpenEvent('CATEGORY_SPIKE', 'categoryName', category)) return;

    await createFinanceEvent('CATEGORY_SPIKE', 'anomaly-detector', {
      categoryName:    category,
      thisWeekSpend:   Math.round(thisWeekSpend * 100) / 100,
      avgWeeklySpend:  Math.round(avgWeeklySpend * 100) / 100,
      multiplier:      Math.round((thisWeekSpend / avgWeeklySpend) * 10) / 10,
      priority:        'normal',
    });

    console.log(
      `[anomaly:CATEGORY_SPIKE] ${category} — $${thisWeekSpend.toFixed(0)} this week vs avg $${avgWeeklySpend.toFixed(0)}`
    );
  } catch (err) {
    console.error('[anomaly:detectCategorySpike]', err);
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Run all three detectors for an incoming transaction.
 * Called fire-and-forget after transaction categorization.
 */
export async function runAnomalyDetection(opts: {
  merchantName: string;
  amount: number;        // absolute value
  category: string;
}): Promise<void> {
  const { merchantName, amount, category } = opts;

  await Promise.allSettled([
    detectUnusualCharge(merchantName, amount),
    detectSubscriptionPriceChange(merchantName, amount),
    detectCategorySpike(category),
  ]);
}
