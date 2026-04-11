/**
 * Net Worth Tracker
 *
 * Records a daily snapshot of assets vs liabilities derived from Account balances.
 *
 * Assets     = sum of all non-credit accounts
 * Liabilities = sum of credit account balances (absolute value)
 * Net Worth   = assets − liabilities
 *
 * Only one snapshot is written per calendar day (idempotent).
 * Called fire-and-forget from the finance orchestrator.
 */

import { prisma } from '@/lib/prisma';

export type NetWorthPoint = {
  date: string;       // YYYY-MM-DD
  assets: number;
  liabilities: number;
  netWorth: number;
};

// ─── Snapshot recording ───────────────────────────────────────────────────────

export async function recordNetWorthSnapshot(): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dateKey = today.toISOString().slice(0, 10);

  // Skip if already recorded today
  const existing = await prisma.netWorthSnapshot.findUnique({
    where: { date: today },
  });
  if (existing) return;

  const accounts = await prisma.account.findMany({
    select: { balance: true, type: true },
  });

  let assets = 0;
  let liabilities = 0;

  for (const acc of accounts) {
    const t = (acc.type ?? '').toLowerCase();
    if (t === 'credit') {
      // Credit balances are typically positive numbers representing what's owed
      liabilities += Math.abs(acc.balance);
    } else {
      assets += acc.balance;
    }
  }

  const netWorth = assets - liabilities;

  await prisma.netWorthSnapshot.create({
    data: {
      date: today,
      assets: Math.round(assets * 100) / 100,
      liabilities: Math.round(liabilities * 100) / 100,
      netWorth: Math.round(netWorth * 100) / 100,
    },
  });

  console.log(
    `[netWorth] snapshot recorded — assets $${assets.toFixed(0)}, liabilities $${liabilities.toFixed(0)}, net $${netWorth.toFixed(0)} (${dateKey})`
  );
}

// ─── History reader ───────────────────────────────────────────────────────────

export async function getNetWorthHistory(days = 30): Promise<NetWorthPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const rows = await prisma.netWorthSnapshot.findMany({
    where: { date: { gte: since } },
    orderBy: { date: 'asc' },
    take: days,
  });

  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    assets: r.assets,
    liabilities: r.liabilities,
    netWorth: r.netWorth,
  }));
}

// ─── Backfill ─────────────────────────────────────────────────────────────────

/**
 * Reconstructs historical net worth from transaction history.
 *
 * Algorithm:
 *   1. Compute current net worth from live account balances
 *   2. Fetch all transactions in the lookback window, ordered newest → oldest
 *   3. Walk backwards day by day — for each day, the net worth at end of that
 *      day = currentNetWorth − sum(transactions that occurred AFTER that day)
 *
 * This works because transactions are signed balance deltas.
 * Already-written snapshots are skipped (idempotent).
 */
export async function backfillNetWorthHistory(days = 30): Promise<void> {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);

  // Current net worth baseline
  const accounts = await prisma.account.findMany({ select: { balance: true, type: true } });
  let currentAssets = 0;
  let currentLiabilities = 0;
  for (const acc of accounts) {
    const t = (acc.type ?? '').toLowerCase();
    if (t === 'credit') currentLiabilities += Math.abs(acc.balance);
    else currentAssets += acc.balance;
  }
  const currentNetWorth = currentAssets - currentLiabilities;

  // Transactions in the lookback window (all of them, not just expenses)
  const since = new Date(now.getTime() - days * 86400000);
  const txs = await prisma.transaction.findMany({
    where: { occurredAt: { gte: since } },
    orderBy: { occurredAt: 'desc' },
    select: { amount: true, occurredAt: true },
  });

  // Existing snapshot dates — skip these to stay idempotent
  const existingDates = new Set(
    (await prisma.netWorthSnapshot.findMany({
      where: { date: { gte: since } },
      select: { date: true },
    })).map((r) => r.date.toISOString().slice(0, 10))
  );

  // Walk backwards from yesterday, reconstructing balance
  let cumulativeDelta = 0; // sum of transactions AFTER the current day
  let txIndex = 0;         // pointer into txs (sorted newest → oldest)

  const inserts: Array<{ date: Date; assets: number; liabilities: number; netWorth: number }> = [];

  for (let d = 0; d < days; d++) {
    const targetDate = new Date(now.getTime() - d * 86400000);
    const targetKey = targetDate.toISOString().slice(0, 10);

    // Advance pointer: accumulate transactions that fall after targetDate
    while (txIndex < txs.length) {
      const txDate = new Date(txs[txIndex].occurredAt).toISOString().slice(0, 10);
      if (txDate > targetKey) {
        cumulativeDelta += txs[txIndex].amount;
        txIndex++;
      } else {
        break;
      }
    }

    if (existingDates.has(targetKey)) continue;

    // Estimated net worth at end of targetDate
    const estimatedNetWorth = Math.round((currentNetWorth - cumulativeDelta) * 100) / 100;
    // Approximate assets/liabilities split — keep the ratio, adjust total
    const ratio = currentNetWorth !== 0 ? currentAssets / (currentAssets + currentLiabilities || 1) : 0.8;
    const estTotal = Math.abs(estimatedNetWorth) / (2 * ratio - 1 || 1);
    const estAssets      = Math.round(Math.max(0, estimatedNetWorth + currentLiabilities - cumulativeDelta * (1 - ratio)) * 100) / 100;
    const estLiabilities = Math.round(Math.max(0, estAssets - estimatedNetWorth) * 100) / 100;

    inserts.push({
      date:        targetDate,
      assets:      estAssets,
      liabilities: estLiabilities,
      netWorth:    estimatedNetWorth,
    });
  }

  // Batch insert — skip any failures (race conditions etc.)
  for (const row of inserts) {
    try {
      await prisma.netWorthSnapshot.create({ data: row });
    } catch {
      // Skip duplicate / constraint errors
    }
  }

  console.log(`[netWorth:backfill] wrote ${inserts.length} historical snapshots`);
}

/**
 * Auto-backfill when the graph is empty (called from orchestrator after recordNetWorthSnapshot).
 * Safe to call every request — the count check makes it cheap.
 */
export async function ensureNetWorthHistory(days = 30): Promise<void> {
  const count = await prisma.netWorthSnapshot.count();
  if (count < 2) {
    await backfillNetWorthHistory(days);
  }
}
