/**
 * Income Detector
 *
 * Mirrors subscriptionDetector.ts but for the income side.
 *
 * Analyses positive transaction history to find recurring income patterns
 * (payroll, freelance retainers, rental income, etc.). When a pattern is
 * confirmed it:
 *
 *   1. Upserts an IncomeSource record with the schedule
 *   2. Emits an INCOME_SCHEDULE_DETECTED FinanceEvent (once per source)
 *
 * The cashflow forecaster reads from IncomeSource to project income forward
 * as discrete scheduled events rather than a flat daily rate.
 */

import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { and, desc, eq, gte, ilike, inArray, lt, sql as drizzleSql } from 'drizzle-orm';
import { createFinanceEvent } from '@/lib/finance/events';
import { randomUUID } from 'node:crypto';

// ─── Config ───────────────────────────────────────────────────────────────────

const MIN_OCCURRENCES = 3;
const AMOUNT_VARIANCE_RATIO = 0.10;    // 10% — payroll is consistent but may vary slightly
const MAX_GAP_DEVIATION = 0.40;        // no single gap > 40% off average

const INCOME_INTERVALS = [
  { label: 'weekly',    minDays:  6, maxDays:  8  },
  { label: 'biweekly',  minDays: 12, maxDays: 16  },
  { label: 'monthly',   minDays: 28, maxDays: 32  },
];

const LOOKBACK_DAYS = 120;              // analyse more history than subscription detector
const MIN_AMOUNT = 200;                 // ignore micro-deposits and refunds

// ─── Types ────────────────────────────────────────────────────────────────────

type IncomeDetectionResult =
  | { detected: true;  interval: string; avgAmount: number; avgDays: number; lastDate: Date }
  | { detected: false; reason: string };

export type DetectedIncomeSource = {
  id: string;
  source: string;
  amount: number;
  interval: string;
  avgDays: number;
  lastSeenDate: Date;
  confirmed: boolean;
};

// ─── Core analysis ────────────────────────────────────────────────────────────

export async function detectIncomePattern(
  description: string
): Promise<IncomeDetectionResult> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const txs = await db.select({ occurredAt: schema.transactions.occurredAt, amount: schema.transactions.amount })
    .from(schema.transactions)
    .where(and(
      ilike(schema.transactions.description, description),
      gte(schema.transactions.amount, MIN_AMOUNT),
      gte(schema.transactions.occurredAt, since)
    ))
    .orderBy(desc(schema.transactions.occurredAt)); // Ordered newest first in orchestrator, but here we need asc

  // Correct ordering for gap calculation
  txs.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  if (txs.length < MIN_OCCURRENCES) {
    return { detected: false, reason: `Only ${txs.length} occurrence(s) — need ${MIN_OCCURRENCES}` };
  }

  // ── Amount consistency ────────────────────────────────────────────────────
  const amounts = txs.map((t) => t.amount);
  const med = median(amounts);
  const consistent = amounts.filter(
    (a) => Math.abs(a - med) / med <= AMOUNT_VARIANCE_RATIO
  );

  if (consistent.length < MIN_OCCURRENCES) {
    return { detected: false, reason: 'Amounts vary too widely to be a recurring income' };
  }

  // ── Interval analysis ─────────────────────────────────────────────────────
  const dates = txs.map((t) => new Date(t.occurredAt).getTime());
  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
  }

  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;

  const bucket = INCOME_INTERVALS.find(
    (b) => avgGap >= b.minDays && avgGap <= b.maxDays
  );

  if (!bucket) {
    return {
      detected: false,
      reason: `Avg gap ${avgGap.toFixed(1)}d doesn't match any income interval`,
    };
  }

  const tooIrregular = gaps.some((g) => Math.abs(g - avgGap) / avgGap > MAX_GAP_DEVIATION);
  if (tooIrregular) {
    return { detected: false, reason: 'Payment timing too irregular' };
  }

  return {
    detected: true,
    interval: bucket.label,
    avgAmount: med,
    avgDays: Math.round(avgGap),
    lastDate: new Date(txs[txs.length - 1].occurredAt),
  };
}

// ─── Orchestration ────────────────────────────────────────────────────────────

/**
 * Run detection for a given income description.
 * If a schedule is found for the first time, persists it and emits an event.
 * Safe to call fire-and-forget.
 */
export async function runIncomeDetection(description: string): Promise<void> {
  try {
    const normalizedSource = description.trim();

    // Already detected — don't re-analyse
    const [existing] = await db.select()
      .from(schema.incomeSources)
      .where(eq(schema.incomeSources.source, normalizedSource))
      .limit(1);
    if (existing) return;

    const result = await detectIncomePattern(description);
    if (!result.detected) {
      console.log(`[incomeDetector:${description}] ${result.reason}`);
      return;
    }

    // Persist the income schedule
    await db.insert(schema.incomeSources).values({
      id: randomUUID(),
      source: normalizedSource,
      amount: result.avgAmount,
      interval: result.interval,
      avgDays: result.avgDays,
      lastSeenDate: result.lastDate,
      updatedAt: new Date(),
    });

    // Emit event — stays in the Action Feed for user awareness
    await createFinanceEvent('INCOME_SCHEDULE_DETECTED', 'income-detector', {
      employer: normalizedSource,
      amount: result.avgAmount,
      interval: result.interval,
      avgDays: result.avgDays,
      priority: 'normal',
    });

    console.log(
      `[incomeDetector:${description}] detected — ${result.interval} ~$${result.avgAmount.toFixed(2)}`
    );
  } catch (err) {
    console.error(`[incomeDetector:${description}] error:`, err);
  }
}

/**
 * Scan all recent positive transactions and run detection on any description
 * with enough occurrences that hasn't been classified yet.
 *
 * Called once per forecast run — safe to call fire-and-forget from the orchestrator.
 */
export async function scanForIncomeSchedules(): Promise<void> {
  try {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    // Find descriptions appearing ≥ MIN_OCCURRENCES times in the lookback window
    const candidates = await db.select({
      description: schema.transactions.description,
      count: drizzleSql<number>`count(*)`
    })
    .from(schema.transactions)
    .where(and(
      gte(schema.transactions.amount, MIN_AMOUNT),
      gte(schema.transactions.occurredAt, since),
      drizzleSql`${schema.transactions.description} IS NOT NULL`
    ))
    .groupBy(schema.transactions.description)
    .having(drizzleSql`count(*) >= ${MIN_OCCURRENCES}`);

    // Run detection on each candidate that isn't already known
    await Promise.allSettled(
      candidates
        .filter((c) => c.description)
        .map((c) => runIncomeDetection(c.description!))
    );
  } catch (err) {
    console.error('[incomeDetector:scan] error:', err);
  }
}

/**
 * Return all persisted income sources, sorted by amount descending.
 * Used by the cashflow forecaster to project income forward.
 */
export async function listIncomeSources(): Promise<DetectedIncomeSource[]> {
  const sources = await db.select()
    .from(schema.incomeSources)
    .orderBy(desc(schema.incomeSources.amount));
  return sources.map((s) => ({
    id: s.id,
    source: s.source,
    amount: s.amount,
    interval: s.interval,
    avgDays: s.avgDays,
    lastSeenDate: s.lastSeenDate,
    confirmed: s.confirmed,
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
