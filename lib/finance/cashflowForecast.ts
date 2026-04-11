/**
 * Cash Flow Forecaster — Phase 8 (v3)
 *
 * Predicts the next 60 days of liquidity by applying four forces per day:
 *
 *   1. Opening balance  — liquid accounts only (account.liquid = true, or type-based fallback)
 *   2. Scheduled income — IncomeSource schedules projected forward (biweekly / monthly paydays)
 *   3. Scheduled outflows — Payables (exact dates) + confirmed subscriptions
 *   4. Discretionary burn — BudgetCategory monthlyTarget ÷ 30 per day
 *
 * Income is schedule-first. Residual daily rate is only used for positive transactions
 * that don't match any detected IncomeSource pattern.
 *
 * Emits LOW_CASH_FORECAST (deduplicated) when projected balance < $1,000.
 */

import { prisma } from '@/lib/prisma';
import { createFinanceEvent } from '@/lib/finance/events';
import { listIncomeSources, scanForIncomeSchedules, type DetectedIncomeSource } from '@/lib/finance/incomeDetector';

// ─── Config ───────────────────────────────────────────────────────────────────

const FORECAST_DAYS = 60;
const LOW_CASH_THRESHOLD = 1_000;
const INCOME_LOOKBACK_DAYS = 90;

// Type-based fallback when account.liquid hasn't been set manually
const LIQUID_TYPES   = new Set(['checking', 'savings', 'cash', 'money market']);
const ILLIQUID_TYPES = new Set(['investment', 'brokerage', 'retirement', '401k', 'ira', 'hsa', 'crypto']);

// Subscription interval label → days
const SUBSCRIPTION_INTERVAL_DAYS: Record<string, number> = {
  weekly:    7,
  biweekly:  14,
  monthly:   30,
  quarterly: 91,
  annual:    365,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type ForecastOutflow = {
  label: string;
  amount: number;
  type: 'payable' | 'subscription';
};

export type PaydaySchedule = {
  source: string;
  amount: number;
  intervalLabel: string;
  intervalDays: number;
  nextDate: string;        // first projected payday within forecast window (YYYY-MM-DD)
};

export type ForecastDay = {
  date: string;
  projectedBalance: number;
  scheduledOutflows: ForecastOutflow[];
  projectedIncome: number;
  estimatedSpend: number;
  isLowBalanceAlert: boolean;
};

export type ForecastConfidence = {
  score: number;           // 0–100
  label: string;           // 'Low' | 'Fair' | 'Good' | 'High'
  factors: string[];       // brief descriptions of what's driving the score
};

export type CashFlowForecast = {
  generatedAt: string;
  openingBalance: number;
  liquidAccountsOnly: boolean;
  days: ForecastDay[];
  lowestPoint: { date: string; balance: number };
  paydaySchedules: PaydaySchedule[];
  alerts: string[];
  confidence: ForecastConfidence;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function isLiquidAccount(account: { type: string; liquid: boolean }): boolean {
  // Explicit override wins
  if (!account.liquid) return false;
  const t = (account.type ?? '').toLowerCase();
  // If type is a known illiquid category, exclude even if liquid=true (data hygiene)
  if (ILLIQUID_TYPES.has(t)) return false;
  // If type is explicitly liquid, include
  if (LIQUID_TYPES.has(t)) return true;
  // Unknown type + liquid=true (the default) → include conservatively
  return account.liquid;
}

async function hasOpenLowCashEvent(): Promise<boolean> {
  return (await prisma.financeEvent.findFirst({
    where: { type: 'LOW_CASH_FORECAST', resolved: false },
  })) !== null;
}

// ─── 1. Opening balance — liquid accounts only ────────────────────────────────

async function loadOpeningBalance(): Promise<{ balance: number; liquidOnly: boolean }> {
  const accounts = await prisma.account.findMany({
    select: { balance: true, type: true, liquid: true },
  });

  const liquidAccounts = accounts.filter(isLiquidAccount);

  // If nothing qualifies (all unknown types), fall back to non-credit
  if (liquidAccounts.length === 0) {
    const fallback = accounts
      .filter((a) => (a.type ?? '').toLowerCase() !== 'credit')
      .reduce((s, a) => s + a.balance, 0);
    return { balance: fallback, liquidOnly: false };
  }

  return {
    balance: liquidAccounts.reduce((s, a) => s + a.balance, 0),
    liquidOnly: true,
  };
}

// ─── 2. Payable outflows (exact dates) ───────────────────────────────────────

async function loadPayableOutflows(): Promise<Map<string, ForecastOutflow[]>> {
  const now = new Date();
  const horizon = addDays(now, FORECAST_DAYS);

  const payables = await prisma.payable.findMany({
    where: { dueDate: { gte: now, lte: horizon } },
    select: { vendor: true, amount: true, dueDate: true, status: true },
  });

  const map = new Map<string, ForecastOutflow[]>();
  for (const p of payables) {
    if (!p.dueDate) continue;
    if ((p.status ?? 'pending').toLowerCase() === 'paid') continue;
    const key = toDateKey(new Date(p.dueDate));
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({ label: p.vendor, amount: Math.abs(p.amount), type: 'payable' });
  }
  return map;
}

// ─── 3. Subscription outflows (projected forward) ────────────────────────────

async function loadSubscriptionOutflows(): Promise<Map<string, ForecastOutflow[]>> {
  const now = new Date();

  const subscriptions = await prisma.merchantProfile.findMany({
    where: {
      isSubscription: true,
      subscriptionConfirmed: true,
      billingInterval: { not: null },
    },
    select: { merchantName: true, billingInterval: true },
  });

  const map = new Map<string, ForecastOutflow[]>();

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        const intervalDays = SUBSCRIPTION_INTERVAL_DAYS[sub.billingInterval ?? ''];
        if (!intervalDays) return;

        const lastTx = await prisma.transaction.findFirst({
          where: {
            description: { equals: sub.merchantName, mode: 'insensitive' },
            amount: { lt: 0 },
          },
          orderBy: { occurredAt: 'desc' },
          select: { amount: true, occurredAt: true },
        });
        if (!lastTx) return;

        const amount = Math.abs(lastTx.amount);
        let next = addDays(new Date(lastTx.occurredAt), intervalDays);

        while (daysBetween(now, next) <= FORECAST_DAYS) {
          if (next >= now) {
            const key = toDateKey(next);
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push({ label: sub.merchantName, amount, type: 'subscription' });
          }
          next = addDays(next, intervalDays);
        }
      } catch { /* skip */ }
    })
  );

  return map;
}

// ─── 4. Income schedule (from IncomeSource table) ────────────────────────────

/**
 * Project each IncomeSource forward, building a Map<dateKey, totalIncome>.
 * Also returns the PaydaySchedule[] for the UI.
 */
function buildIncomeMap(
  sources: DetectedIncomeSource[]
): { incomeMap: Map<string, number>; paydaySchedules: PaydaySchedule[] } {
  const now = new Date();
  const incomeMap = new Map<string, number>();
  const paydaySchedules: PaydaySchedule[] = [];

  for (const src of sources) {
    // Project forward from last seen date
    let next = addDays(src.lastSeenDate, src.avgDays);
    // Advance until future
    while (next < now) next = addDays(next, src.avgDays);

    const firstNext = toDateKey(next);

    // Record all occurrences within window
    let cursor = new Date(next);
    while (daysBetween(now, cursor) <= FORECAST_DAYS) {
      const key = toDateKey(cursor);
      incomeMap.set(key, (incomeMap.get(key) ?? 0) + src.amount);
      cursor = addDays(cursor, src.avgDays);
    }

    paydaySchedules.push({
      source: src.source,
      amount: Math.round(src.amount * 100) / 100,
      intervalLabel: src.interval,
      intervalDays: src.avgDays,
      nextDate: firstNext,
    });
  }

  return { incomeMap, paydaySchedules };
}

/**
 * Residual daily income — positive transactions not from any known IncomeSource.
 * Fallback only; gives the forecast a floor when no schedules are detected.
 */
async function loadResidualDailyIncome(knownSources: string[]): Promise<number> {
  const since = new Date(Date.now() - INCOME_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const txs =
    knownSources.length > 0
      ? await prisma.transaction.findMany({
          where: {
            amount: { gt: 0 },
            occurredAt: { gte: since },
            description: { notIn: knownSources },
          },
          select: { amount: true },
        })
      : await prisma.transaction.findMany({
          where: {
            amount: { gt: 0 },
            occurredAt: { gte: since },
          },
          select: { amount: true },
        });

  if (txs.length === 0) return 0;
  const total = txs.reduce((s, t) => s + t.amount, 0);
  return total / INCOME_LOOKBACK_DAYS;
}

// ─── 5. Discretionary spend floor ────────────────────────────────────────────

async function loadDailySpendRate(): Promise<number> {
  try {
    const cats = await prisma.budgetCategory.findMany({ select: { monthlyTarget: true } });
    const total = cats.reduce((s, c) => s + c.monthlyTarget, 0);
    return total > 0 ? total / 30 : 0;
  } catch {
    return 0;
  }
}

// ─── 6. Confidence scoring ────────────────────────────────────────────────────

/**
 * Rates how reliable this forecast is based on the quality of input data.
 *
 * Four components:
 *   Income (0–40 pts)   — scheduled paydays vs flat rate
 *   Outflows (0–35 pts) — confirmed subscriptions + exact payables
 *   Spend rate (0–15 pts) — budget category data
 *   Balance (0–10 pts)  — liquid account typing
 */
function computeConfidence(opts: {
  paydayCount: number;
  confirmedPaydays: number;
  subscriptionCount: number;
  payableCount: number;
  budgetCategoryCount: number;
  liquidAccountsOnly: boolean;
  residualDailyIncome: number;
}): ForecastConfidence {
  const factors: string[] = [];
  let score = 0;

  // ── Income component (0–40) ──────────────────────────────────────────────
  if (opts.paydayCount === 0) {
    // No schedule detected — income is a rough average
    const incomeScore = opts.residualDailyIncome > 0 ? 15 : 5;
    score += incomeScore;
    factors.push(opts.residualDailyIncome > 0
      ? 'Income estimated from historical average'
      : 'No income data available');
  } else {
    const scheduleScore = Math.min(40, 25 + opts.confirmedPaydays * 7 + (opts.paydayCount - opts.confirmedPaydays) * 3);
    score += scheduleScore;
    factors.push(
      opts.confirmedPaydays > 0
        ? `${opts.confirmedPaydays} confirmed income schedule${opts.confirmedPaydays > 1 ? 's' : ''}`
        : `${opts.paydayCount} detected income schedule${opts.paydayCount > 1 ? 's' : ''} (unconfirmed)`
    );
  }

  // ── Outflows component (0–35) ────────────────────────────────────────────
  const outflowScore =
    Math.min(20, opts.subscriptionCount * 4) +
    Math.min(15, opts.payableCount * 5);
  score += outflowScore;
  if (opts.subscriptionCount > 0) {
    factors.push(`${opts.subscriptionCount} confirmed subscription${opts.subscriptionCount > 1 ? 's' : ''}`);
  }
  if (opts.payableCount > 0) {
    factors.push(`${opts.payableCount} scheduled payable${opts.payableCount > 1 ? 's' : ''}`);
  }
  if (outflowScore === 0) {
    factors.push('No scheduled outflows');
  }

  // ── Spend rate component (0–15) ──────────────────────────────────────────
  const spendScore = Math.min(15, opts.budgetCategoryCount * 5);
  score += spendScore;
  if (opts.budgetCategoryCount > 0) {
    factors.push(`Spend rate from ${opts.budgetCategoryCount} budget categories`);
  } else {
    factors.push('Discretionary spend is estimated');
  }

  // ── Balance component (0–10) ─────────────────────────────────────────────
  score += opts.liquidAccountsOnly ? 10 : 5;
  if (!opts.liquidAccountsOnly) {
    factors.push('Opening balance may include non-liquid accounts');
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const label =
    clamped >= 80 ? 'High' :
    clamped >= 60 ? 'Good' :
    clamped >= 35 ? 'Fair' : 'Low';

  return { score: clamped, label, factors };
}

// ─── Main engine ─────────────────────────────────────────────────────────────

export async function buildCashFlowForecast(): Promise<CashFlowForecast> {
  const now = new Date();

  // Run income scan asynchronously (fire-and-forget) to keep IncomeSource up to date
  scanForIncomeSchedules().catch(() => {});

  // Load all inputs in parallel
  const [
    { balance: openingBalance, liquidOnly },
    payableMap,
    subscriptionMap,
    incomeSources,
    dailySpend,
  ] = await Promise.all([
    loadOpeningBalance(),
    loadPayableOutflows(),
    loadSubscriptionOutflows(),
    listIncomeSources(),
    loadDailySpendRate(),
  ]);

  const { incomeMap, paydaySchedules } = buildIncomeMap(incomeSources);
  const knownSources = incomeSources.map((s) => s.source);
  const residualDaily = await loadResidualDailyIncome(knownSources);

  // Inputs needed for confidence scoring
  const confirmedPaydays = incomeSources.filter((s) => (s as { confirmed?: boolean }).confirmed).length;
  const subscriptionCount = subscriptionMap.size > 0
    ? (await prisma.merchantProfile.count({ where: { isSubscription: true, subscriptionConfirmed: true } }))
    : 0;
  const payableCount = payableMap.size;
  const budgetCategoryCount = dailySpend > 0
    ? (await prisma.budgetCategory.count())
    : 0;

  // ── Walk the 60-day timeline ─────────────────────────────────────────────

  const days: ForecastDay[] = [];
  let running = openingBalance;
  let lowestPoint = { date: toDateKey(now), balance: openingBalance };

  for (let i = 1; i <= FORECAST_DAYS; i++) {
    const date = addDays(now, i);
    const key = toDateKey(date);

    const scheduledOutflows: ForecastOutflow[] = [
      ...(payableMap.get(key) ?? []),
      ...(subscriptionMap.get(key) ?? []),
    ];

    const outflowTotal = scheduledOutflows.reduce((s, o) => s + o.amount, 0);
    const scheduledIncome = incomeMap.get(key) ?? 0;
    const projectedIncome = scheduledIncome + residualDaily;

    running = running + projectedIncome - dailySpend - outflowTotal;
    const rounded = Math.round(running * 100) / 100;

    days.push({
      date: key,
      projectedBalance: rounded,
      scheduledOutflows,
      projectedIncome: Math.round(projectedIncome * 100) / 100,
      estimatedSpend: Math.round(dailySpend * 100) / 100,
      isLowBalanceAlert: running < LOW_CASH_THRESHOLD,
    });

    if (running < lowestPoint.balance) {
      lowestPoint = { date: key, balance: rounded };
    }
  }

  // ── Alerts ───────────────────────────────────────────────────────────────

  const alerts: string[] = [];

  const firstLow = days.find((d) => d.isLowBalanceAlert);
  if (firstLow) {
    alerts.push(
      `Projected balance drops below $${LOW_CASH_THRESHOLD.toLocaleString()} on ${firstLow.date}`
    );
  }

  if (!liquidOnly) {
    alerts.push('Opening balance may include non-liquid accounts — actual liquidity could be lower');
  }

  const bigOutflowDays = days
    .filter((d) => d.scheduledOutflows.reduce((s, o) => s + o.amount, 0) > 500)
    .slice(0, 3);
  for (const d of bigOutflowDays) {
    const total = d.scheduledOutflows.reduce((s, o) => s + o.amount, 0);
    alerts.push(`$${total.toFixed(0)} in scheduled payments on ${d.date}`);
  }

  const confidence = computeConfidence({
    paydayCount:          incomeSources.length,
    confirmedPaydays,
    subscriptionCount,
    payableCount,
    budgetCategoryCount,
    liquidAccountsOnly:   liquidOnly,
    residualDailyIncome:  residualDaily,
  });

  return {
    generatedAt: now.toISOString(),
    openingBalance: Math.round(openingBalance * 100) / 100,
    liquidAccountsOnly: liquidOnly,
    days,
    lowestPoint,
    paydaySchedules,
    alerts,
    confidence,
  };
}

// ─── Event emission ───────────────────────────────────────────────────────────

export async function runCashFlowForecast(): Promise<CashFlowForecast> {
  const forecast = await buildCashFlowForecast();

  try {
    if (forecast.lowestPoint.balance < LOW_CASH_THRESHOLD && !(await hasOpenLowCashEvent())) {
      await createFinanceEvent('LOW_CASH_FORECAST', 'cashflow-forecaster', {
        lowestBalance: forecast.lowestPoint.balance,
        lowestDate: forecast.lowestPoint.date,
        openingBalance: forecast.openingBalance,
        liquidAccountsOnly: forecast.liquidAccountsOnly,
        threshold: LOW_CASH_THRESHOLD,
        priority: 'high',
      });
      console.log(
        `[cashflow:LOW_CASH_FORECAST] projected low: $${forecast.lowestPoint.balance} on ${forecast.lowestPoint.date}`
      );
    }
  } catch (err) {
    console.error('[cashflow:runCashFlowForecast] event emission error:', err);
  }

  return forecast;
}
