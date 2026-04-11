/**
 * Subscription Detector
 *
 * After each merchant touch, checks whether a recurring billing pattern exists
 * by analysing real Transaction records. When a pattern is confirmed it:
 *   1. Updates MerchantProfile.isSubscription + billingInterval
 *   2. Emits a SUBSCRIPTION_DETECTED FinanceEvent (once — not on every charge)
 */

import { prisma } from '@/lib/prisma';
import { normalizeMerchantName } from '@/lib/finance/merchantProfile';
import { createFinanceEvent } from '@/lib/finance/events';

// ─── Interval buckets ────────────────────────────────────────────────────────

type IntervalBucket = {
  label: string;       // human-readable
  minDays: number;
  maxDays: number;
};

const INTERVAL_BUCKETS: IntervalBucket[] = [
  { label: 'weekly',     minDays:   6, maxDays:   8 },
  { label: 'biweekly',   minDays:  13, maxDays:  15 },
  { label: 'monthly',    minDays:  28, maxDays:  32 },
  { label: 'quarterly',  minDays:  88, maxDays:  95 },
  { label: 'annual',     minDays: 360, maxDays: 370 },
];

// Require at least this many transactions before attempting detection
const MIN_TRANSACTIONS = 3;

// Amount variance threshold — charges must be within 10% of the median to count
const AMOUNT_VARIANCE_RATIO = 0.10;

// ─── Core analysis ────────────────────────────────────────────────────────────

type SubscriptionResult =
  | { detected: true; interval: string; avgAmount: number; avgDays: number }
  | { detected: false; reason: string };

export async function detectSubscription(merchantName: string): Promise<SubscriptionResult> {
  const normalized = normalizeMerchantName(merchantName);

  // Fetch all matching transactions, oldest first
  const txs = await prisma.transaction.findMany({
    where: {
      description: { equals: normalized, mode: 'insensitive' },
      amount: { lt: 0 },  // Only expenses (negative amounts)
    },
    orderBy: { occurredAt: 'asc' },
    select: { occurredAt: true, amount: true },
  });

  if (txs.length < MIN_TRANSACTIONS) {
    return { detected: false, reason: `Only ${txs.length} transaction(s) — need ${MIN_TRANSACTIONS}` };
  }

  // ── Amount consistency check ──────────────────────────────────────────────
  const amounts = txs.map((t) => Math.abs(t.amount));
  const medianAmount = median(amounts);
  const consistentAmounts = amounts.filter(
    (a) => Math.abs(a - medianAmount) / medianAmount <= AMOUNT_VARIANCE_RATIO
  );

  if (consistentAmounts.length < MIN_TRANSACTIONS) {
    return { detected: false, reason: 'Amounts vary too widely to be a subscription' };
  }

  // ── Interval analysis ─────────────────────────────────────────────────────
  const dates = txs.map((t) => new Date(t.occurredAt).getTime());
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24)); // days
  }

  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;

  const bucket = INTERVAL_BUCKETS.find(
    (b) => avgGap >= b.minDays && avgGap <= b.maxDays
  );

  if (!bucket) {
    return {
      detected: false,
      reason: `Avg gap ${avgGap.toFixed(1)}d doesn't match any billing interval`,
    };
  }

  // ── Gap consistency — reject if any gap deviates > 40% from average ───────
  const tooIrregular = gaps.some((g) => Math.abs(g - avgGap) / avgGap > 0.40);
  if (tooIrregular) {
    return { detected: false, reason: 'Billing timing too irregular' };
  }

  return {
    detected: true,
    interval: bucket.label,
    avgAmount: medianAmount,
    avgDays: Math.round(avgGap),
  };
}

// ─── Orchestration ────────────────────────────────────────────────────────────

/**
 * Run detection for a merchant and, if a pattern is found for the first time,
 * update the profile and emit a SUBSCRIPTION_DETECTED event.
 *
 * Safe to call fire-and-forget — never throws.
 */
export async function runSubscriptionDetection(merchantName: string): Promise<void> {
  try {
    const profile = await prisma.merchantProfile.findUnique({
      where: { merchantName: normalizeMerchantName(merchantName) },
    });

    if (!profile) return;

    // Already confirmed or previously detected — don't re-emit
    if (profile.isSubscription) return;

    const result = await detectSubscription(merchantName);
    if (!result.detected) {
      console.log(`[subscriptionDetector:${merchantName}] ${result.reason}`);
      return;
    }

    // Update profile
    await prisma.merchantProfile.update({
      where: { id: profile.id },
      data: {
        isSubscription: true,
        billingInterval: result.interval,
      },
    });

    // Emit event — medium priority, stays in feed until confirmed or ignored
    await createFinanceEvent('SUBSCRIPTION_DETECTED', 'merchant-profile', {
      merchant: profile.merchantName,
      amount: result.avgAmount,
      interval: result.interval,
      avgDays: result.avgDays,
      merchantProfileId: profile.id,
      priority: 'normal',
    });

    console.log(
      `[subscriptionDetector:${merchantName}] detected — ${result.interval} ~$${result.avgAmount.toFixed(2)}`
    );
  } catch (err) {
    console.error(`[subscriptionDetector:${merchantName}] error:`, err);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
