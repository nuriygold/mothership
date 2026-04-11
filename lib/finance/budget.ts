/**
 * Budget Calculation Service
 *
 * Computes month-to-date spending per BudgetCategory by:
 *   1. Summing Transaction.amount (negative = expense) for the current calendar month
 *   2. Matching transactions to budget categories via:
 *      a. transaction.category exact match
 *      b. MerchantProfile.isSubscription → "subscriptions" bucket
 *   3. Emitting BUDGET_THRESHOLD events when a category crosses 80% (once per month)
 */

import { prisma } from '@/lib/prisma';
import { createFinanceEvent } from '@/lib/finance/events';

export type BudgetCategoryRow = {
  id: string;
  name: string;
  monthlyTarget: number;
  emoji: string | null;
  spent: number;
  remaining: number;
  percentUsed: number;
  status: 'green' | 'yellow' | 'red';
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function currentMonthBounds(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

function statusFromPercent(pct: number): 'green' | 'yellow' | 'red' {
  const remaining = 100 - pct;
  if (remaining > 40) return 'green';
  if (remaining >= 10) return 'yellow';
  return 'red';
}

// ─── Main calculation ─────────────────────────────────────────────────────────

export async function calculateBudget(): Promise<BudgetCategoryRow[]> {
  const { start, end } = currentMonthBounds();

  // Fetch budget categories + all expense transactions this month in parallel
  const [categories, transactions, subscriptionMerchants] = await Promise.all([
    prisma.budgetCategory.findMany({ orderBy: { monthlyTarget: 'desc' } }),
    prisma.transaction.findMany({
      where: {
        amount: { lt: 0 },
        occurredAt: { gte: start, lt: end },
      },
      select: { amount: true, category: true, description: true },
    }),
    prisma.merchantProfile.findMany({
      where: { isSubscription: true, subscriptionConfirmed: true },
      select: { merchantName: true },
    }),
  ]);

  // Build a set of confirmed subscription merchant names for fast lookup
  const subscriptionNames = new Set(
    subscriptionMerchants.map((m) => m.merchantName.toLowerCase())
  );

  // Accumulate spending per category name
  const spendMap: Record<string, number> = {};

  for (const tx of transactions) {
    const abs = Math.abs(tx.amount);
    const cat  = (tx.category ?? '').toLowerCase().trim();
    const desc = (tx.description ?? '').toLowerCase().trim();

    // Check if this transaction is from a confirmed subscription merchant
    const isSubscriptionTx = subscriptionNames.has(desc);

    const bucket = isSubscriptionTx ? 'subscriptions' : (cat || 'general');
    spendMap[bucket] = (spendMap[bucket] ?? 0) + abs;
  }

  // Build result rows
  return categories.map((cat) => {
    const spent      = Math.round((spendMap[cat.name] ?? 0) * 100) / 100;
    const remaining  = Math.round((cat.monthlyTarget - spent) * 100) / 100;
    const percentUsed = cat.monthlyTarget > 0
      ? Math.min(100, Math.round((spent / cat.monthlyTarget) * 100))
      : 0;

    return {
      id:            cat.id,
      name:          cat.name,
      monthlyTarget: cat.monthlyTarget,
      emoji:         cat.emoji,
      spent,
      remaining,
      percentUsed,
      status:        statusFromPercent(percentUsed),
    };
  });
}

// ─── Threshold event emission ─────────────────────────────────────────────────

const THRESHOLD_PCT = 80;

/**
 * Check all categories and emit BUDGET_THRESHOLD events for any that have
 * crossed 80% this month and don't already have an open event.
 * Safe to call fire-and-forget.
 */
export async function checkBudgetThresholds(): Promise<void> {
  try {
    const { start } = currentMonthBounds();
    const rows = await calculateBudget();

    for (const row of rows) {
      if (row.percentUsed < THRESHOLD_PCT) continue;

      // Check if we already have an open threshold event for this category this month
      const existing = await prisma.financeEvent.findFirst({
        where: {
          type: 'BUDGET_THRESHOLD',
          resolved: false,
          createdAt: { gte: start },
          payload: { path: ['categoryName'], equals: row.name },
        },
      });

      if (existing) continue;

      await createFinanceEvent('BUDGET_THRESHOLD', 'budget', {
        categoryName: row.name,
        emoji:        row.emoji ?? '',
        spent:        row.spent,
        monthlyTarget: row.monthlyTarget,
        percentUsed:  row.percentUsed,
        priority:     row.percentUsed >= 100 ? 'high' : 'normal',
      });

      console.log(
        `[budget:threshold] ${row.name} at ${row.percentUsed}% ($${row.spent}/$${row.monthlyTarget})`
      );
    }
  } catch (err) {
    console.error('[budget:checkThresholds] error:', err);
  }
}
