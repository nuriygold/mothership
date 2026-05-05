/**
 * Finance Health Score
 *
 * Aggregates five signals into a 0–100 score representing overall financial health.
 *
 * Weighting:
 *   35%  Liquidity buffer  — months of expenses covered by liquid cash
 *   25%  Budget compliance — how well spending tracks against plan
 *   15%  Subscription load — subscription cost as % of income
 *   15%  Forecast risk     — whether a LOW_CASH_FORECAST event is open
 *   10%  Anomaly load      — count of unresolved anomaly events
 */

import { db } from '@/lib/db/client';
import * as schema from '@/lib/db/schema';
import { and, desc, eq, ilike, inArray, lt, sql as drizzleSql } from 'drizzle-orm';
import type { BudgetCategoryRow } from '@/lib/finance/budget';

// ─── Config ───────────────────────────────────────────────────────────────────

const WEIGHTS = {
  liquidityBuffer:     0.35,
  budgetCompliance:    0.25,
  subscriptionBurden:  0.15,
  forecastRisk:        0.15,
  anomalyLoad:         0.10,
};

// Months of runway considered excellent (score = 100 on this component)
const EXCELLENT_MONTHS_RUNWAY = 6;

// Subscription cost / monthly income ratio considered excellent
const EXCELLENT_SUBSCRIPTION_RATIO = 0.05;  // 5%
const POOR_SUBSCRIPTION_RATIO      = 0.25;  // 25%+ → 0 on this component

// Anomaly events beyond this count → 0 on the anomaly component
const MAX_ANOMALIES = 5;

const ANOMALY_TYPES = [
  'UNUSUAL_CHARGE',
  'SUBSCRIPTION_PRICE_CHANGE',
  'CATEGORY_SPIKE',
  'LOW_CASH_FORECAST',
  'SUBSCRIPTION_OVERLAP',
];

// ─── Types ────────────────────────────────────────────────────────────────────

export type HealthScoreBreakdown = {
  liquidityBuffer:    number;  // 0–100 component score
  budgetCompliance:   number;
  subscriptionBurden: number;
  forecastRisk:       number;
  anomalyLoad:        number;
};

export type HealthScore = {
  score: number;               // 0–100 overall
  message: string;
  breakdown: HealthScoreBreakdown;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function scoreMessage(score: number): string {
  if (score >= 90) return 'Excellent financial position';
  if (score >= 80) return 'Strong financial position';
  if (score >= 70) return 'Healthy, room to improve';
  if (score >= 60) return 'Fair — a few areas need attention';
  if (score >= 45) return 'Some financial stress signals';
  return 'Action needed — review alerts';
}

// ─── Component calculators ────────────────────────────────────────────────────

/** 35% — Months of liquid cash vs monthly burn */
async function liquidityScore(): Promise<number> {
  const [accounts, budgetCategories] = await Promise.all([
    db.select({ balance: schema.accounts.balance, type: schema.accounts.type, liquid: schema.accounts.liquid }).from(schema.accounts),
    db.select({ monthlyTarget: schema.budgetCategories.monthlyTarget }).from(schema.budgetCategories),
  ]);

  const liquidBalance = accounts
    .filter((a) => {
      const t = (a.type ?? '').toLowerCase();
      if (['investment', 'brokerage', 'retirement', '401k', 'ira', 'hsa', 'crypto'].includes(t)) return false;
      if (t === 'credit') return false;
      return a.liquid !== false;
    })
    .reduce((s, a) => s + a.balance, 0);

  const monthlyBurn = budgetCategories.reduce((s, c) => s + c.monthlyTarget, 0);
  if (monthlyBurn <= 0) return 60; // Can't calculate — neutral score

  const monthsRunway = liquidBalance / monthlyBurn;
  // 0 months → 0, EXCELLENT_MONTHS_RUNWAY → 100, linear
  return clamp((monthsRunway / EXCELLENT_MONTHS_RUNWAY) * 100);
}

/** 25% — Average budget compliance across all categories */
function budgetComplianceScore(budgetRows: BudgetCategoryRow[]): number {
  if (budgetRows.length === 0) return 70; // No categories — neutral score

  const activeRows = budgetRows.filter((r) => r.monthlyTarget > 0);
  if (activeRows.length === 0) return 70;

  const avgCompliance = activeRows.reduce((s, r) => {
    // percentUsed: 0% → 100 score, 100% → 0 score, >100% → negative (clamped)
    const compliance = clamp(100 - r.percentUsed);
    return s + compliance;
  }, 0) / activeRows.length;

  return clamp(avgCompliance);
}

/** 15% — Subscription cost as a fraction of detected monthly income */
async function subscriptionBurdenScore(): Promise<number> {
  const [subscriptions, incomeSources] = await Promise.all([
    db.select({ merchantName: schema.merchantProfiles.merchantName, billingInterval: schema.merchantProfiles.billingInterval })
      .from(schema.merchantProfiles)
      .where(and(
        eq(schema.merchantProfiles.isSubscription, true),
        eq(schema.merchantProfiles.subscriptionConfirmed, true),
        drizzleSql`${schema.merchantProfiles.billingInterval} IS NOT NULL`
      )),
    db.select({ amount: schema.incomeSources.amount, interval: schema.incomeSources.interval })
      .from(schema.incomeSources),
  ]);

  // Monthly income
  const MONTHLY_MULT: Record<string, number> = {
    weekly: 4.33, biweekly: 2.167, monthly: 1,
  };
  const monthlyIncome = incomeSources.reduce((s, src) => {
    const mult = MONTHLY_MULT[src.interval] ?? 1;
    return s + src.amount * mult;
  }, 0);

  if (monthlyIncome <= 0) return 70; // No income data — neutral

  // Monthly subscription cost
  const SUB_MULT: Record<string, number> = {
    weekly: 4.33, biweekly: 2.167, monthly: 1, quarterly: 1 / 3, annual: 1 / 12,
  };

  let monthlySubCost = 0;
  await Promise.all(
    subscriptions.map(async (sub) => {
      const [lastTx] = await db.select({ amount: schema.transactions.amount })
        .from(schema.transactions)
        .where(and(
          ilike(schema.transactions.description, sub.merchantName),
          lt(schema.transactions.amount, 0)
        ))
        .orderBy(desc(schema.transactions.occurredAt))
        .limit(1);

      if (lastTx) {
        const mult = SUB_MULT[sub.billingInterval ?? 'monthly'] ?? 1;
        monthlySubCost += Math.abs(lastTx.amount) * mult;
      }
    })
  );

  const ratio = monthlySubCost / monthlyIncome;
  if (ratio <= EXCELLENT_SUBSCRIPTION_RATIO) return 100;
  if (ratio >= POOR_SUBSCRIPTION_RATIO) return 0;

  // Linear interpolation between excellent and poor thresholds
  const range = POOR_SUBSCRIPTION_RATIO - EXCELLENT_SUBSCRIPTION_RATIO;
  return clamp(100 - ((ratio - EXCELLENT_SUBSCRIPTION_RATIO) / range) * 100);
}

/** 15% — Forecast risk: 0 if LOW_CASH_FORECAST open, 100 if clear */
async function forecastRiskScore(): Promise<number> {
  const [openAlert] = await db.select()
    .from(schema.financeEvents)
    .where(and(
      eq(schema.financeEvents.type, 'LOW_CASH_FORECAST'),
      eq(schema.financeEvents.resolved, false)
    ))
    .limit(1);
  return openAlert ? 0 : 100;
}

/** 10% — Unresolved anomaly events (more anomalies → lower score) */
async function anomalyLoadScore(): Promise<number> {
  const [result] = await db.select({ count: drizzleSql<number>`count(*)` })
    .from(schema.financeEvents)
    .where(and(
      inArray(schema.financeEvents.type, ANOMALY_TYPES),
      eq(schema.financeEvents.resolved, false)
    ));
  const count = Number(result.count);
  if (count === 0) return 100;
  return clamp(100 - (count / MAX_ANOMALIES) * 100);
}

// ─── Main calculator ──────────────────────────────────────────────────────────

export async function computeHealthScore(
  budgetRows: BudgetCategoryRow[]
): Promise<HealthScore> {
  const [liquidity, subscriptionBurden, forecastRisk, anomalyLoad] = await Promise.all([
    liquidityScore(),
    subscriptionBurdenScore(),
    forecastRiskScore(),
    anomalyLoadScore(),
  ]);

  const budgetCompliance = budgetComplianceScore(budgetRows);

  const breakdown: HealthScoreBreakdown = {
    liquidityBuffer:    Math.round(liquidity),
    budgetCompliance:   Math.round(budgetCompliance),
    subscriptionBurden: Math.round(subscriptionBurden),
    forecastRisk:       Math.round(forecastRisk),
    anomalyLoad:        Math.round(anomalyLoad),
  };

  const weighted =
    breakdown.liquidityBuffer    * WEIGHTS.liquidityBuffer +
    breakdown.budgetCompliance   * WEIGHTS.budgetCompliance +
    breakdown.subscriptionBurden * WEIGHTS.subscriptionBurden +
    breakdown.forecastRisk       * WEIGHTS.forecastRisk +
    breakdown.anomalyLoad        * WEIGHTS.anomalyLoad;

  const score = Math.round(clamp(weighted));

  return { score, message: scoreMessage(score), breakdown };
}
