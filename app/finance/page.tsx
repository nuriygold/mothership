'use client';

import useSWR, { mutate as globalMutate } from 'swr';
import { useCallback, useMemo, useState } from 'react';
import type { V2FinanceOverviewFeed, V2FinancePlan } from '@/lib/v2/types';

const fetcher = async (url: string): Promise<V2FinanceOverviewFeed> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finance overview fetch failed: ${res.status}`);
  return res.json();
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isPlaidAccount(id: string) { return !UUID_RE.test(id); }

function fmtUSD(n: number, opts: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    ...opts,
  }).format(n);
}

function fmtSigned(n: number) {
  const abs = fmtUSD(Math.abs(n));
  return (n < 0 ? '-' : '+') + abs;
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function FinancePage() {
  const { data, error, isLoading } = useSWR<V2FinanceOverviewFeed>(
    '/api/v2/finance/overview',
    fetcher,
    { refreshInterval: 30_000 }
  );

  const metrics = useMemo(() => {
    if (!data) return null;
    const now = new Date();
    const mk = monthKey(now);

    const netWorth =
      data.netWorthHistory.length > 0
        ? data.netWorthHistory[data.netWorthHistory.length - 1].netWorth
        : data.accounts.reduce((s, a) => s + a.balance, 0);

    // Debt (credit cards + loans) flips negative balances to positive owed.
    const debt = data.accounts
      .filter((a) => {
        const t = a.type.toLowerCase();
        return t.includes('credit') || t.includes('loan') || t.includes('mortgage');
      })
      .reduce((s, a) => s + Math.abs(a.balance), 0);

    // Assets = everything non-debt.
    const assets = data.accounts
      .filter((a) => {
        const t = a.type.toLowerCase();
        return !(t.includes('credit') || t.includes('loan') || t.includes('mortgage'));
      })
      .reduce((s, a) => s + a.balance, 0);

    // Available liquidity = cash/checking/savings only.
    const cash = data.accounts
      .filter((a) => {
        const t = a.type.toLowerCase();
        return t.includes('depository') || t.includes('cash') || t.includes('checking') || t.includes('savings');
      })
      .reduce((s, a) => s + a.balance, 0);

    const monthTx = data.transactions.filter((tx) => {
      const d = new Date(tx.date);
      return !isNaN(d.getTime()) && monthKey(d) === mk;
    });

    const spend = monthTx.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const income = monthTx.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);

    const monthlySubs = data.subscriptions.reduce((s, x) => s + x.monthlyEquivalent, 0);

    return { netWorth, assets, debt, cash, spend, income, monthlySubs };
  }, [data]);

  if (isLoading && !data) {
    return (
      <div className="card"><div className="card-title">Loading finance</div></div>
    );
  }

  if (error || !data) {
    return (
      <div className="card">
        <div className="card-title">Unable to load finance</div>
        <p style={{ fontSize: 13, color: 'var(--text2)' }}>{error?.message ?? 'No data.'}</p>
      </div>
    );
  }

  const recent = data.transactions.slice(0, 10);
  const upcomingPayables = [...data.payables]
    .filter((p) => p.status !== 'paid')
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 6);

  const activePlans = data.plans.filter((p) => p.status === 'ACTIVE' || p.status === 'PAUSED');
  const goals = activePlans.filter((p) => p.targetValue !== null);
  const campaigns = activePlans.filter((p) => p.targetValue === null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="section-head">
        <span>
          Finance &mdash; managed by <strong style={{ color: 'var(--green)' }}>Drake</strong> &middot; watched by{' '}
          <strong style={{ color: 'var(--purple)' }}>Champagne Papi</strong>
        </span>
        <span className="sse-indicator"><span className="sse-pulse" /> live</span>
      </div>

      <PlaidBar onSyncDone={() => globalMutate('/api/v2/finance/overview')} />

      {/* Hero: net worth */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="card-title">Net worth</div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                fontFamily: 'var(--font-rajdhani)',
                letterSpacing: 1,
                color: 'var(--text)',
              }}
            >
              {fmtUSD(metrics?.netWorth ?? 0)}
            </div>
            <div className="card-sub">
              {data.netWorthHistory.length > 0
                ? `${data.netWorthHistory.length} snapshot${data.netWorthHistory.length === 1 ? '' : 's'} on file`
                : 'No history yet'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Stat label="Assets"            value={fmtUSD(metrics?.assets ?? 0)}  tone="pos" />
            <Stat label="Debt"              value={fmtUSD(metrics?.debt ?? 0)}    tone="neg" />
            <Stat label="Available liquidity" value={fmtUSD(metrics?.cash ?? 0)}  tone="neutral" />
            <Stat label="Income (MTD)"      value={fmtUSD(metrics?.income ?? 0)}  tone="pos" />
            <Stat label="Spend (MTD)"       value={fmtUSD(metrics?.spend ?? 0)}   tone="neg" />
            <Stat label="Subs / month"      value={fmtUSD(metrics?.monthlySubs ?? 0)} tone="neutral" />
          </div>
        </div>
      </div>

      {/* Accounts row */}
      {data.accounts.length > 0 && (
        <div className="card">
          <div className="card-title">Accounts &mdash; /api/v2/finance/overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {data.accounts.map((a) => {
              const t = a.type.toLowerCase();
              const isDebt = t.includes('credit') || t.includes('loan') || t.includes('mortgage');
              const isInvestment = t.includes('investment');
              // Debit (liquid): muted lime. Credit/loan/mortgage: warm amber. Investment: champagne papi emerald. Other: neutral.
              const cardBg =
                isDebt        ? 'rgba(245, 158, 11, 0.08)'
                : isInvestment ? 'rgba(16, 185, 129, 0.08)'
                : a.liquid    ? 'rgba(132, 204, 22, 0.07)'
                :               'var(--bg2)';
              const cardBorder =
                isDebt        ? '1px solid rgba(245, 158, 11, 0.40)'
                : isInvestment ? '1px solid rgba(16, 185, 129, 0.40)'
                : a.liquid    ? '1px solid rgba(132, 204, 22, 0.35)'
                :               '1px solid var(--border-c)';
              return (
              <div
                key={a.id}
                style={{
                  padding: 12,
                  background: cardBg,
                  border: cardBorder,
                  borderRadius: 'var(--radius)',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {a.type}
                  </div>
                  {isPlaidAccount(a.id) && (
                    <span
                      title="Synced via Plaid"
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: 0.5,
                        color: '#000',
                        background: '#00C2A8',
                        borderRadius: 3,
                        padding: '1px 5px',
                        lineHeight: '14px',
                      }}
                    >
                      P
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 4, fontWeight: 500 }}>{a.name}</div>
                <div
                  style={{
                    fontSize: 18,
                    color: 'var(--text)',
                    marginTop: 6,
                    fontFamily: 'var(--font-rajdhani)',
                    fontWeight: 600,
                    letterSpacing: 0.5,
                  }}
                >
                  {fmtUSD(a.balance)}
                </div>
                {a.updatedAt && (
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
                    as of {new Date(a.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Two-column: Transactions | Payables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="card">
          <div className="card-title">Transactions &mdash; recent</div>
          <TransactionSparkline transactions={data.transactions} />
          {recent.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              No transactions yet.
            </div>
          ) : (
            recent.map((tx, i) => {
              const isIn = tx.amount >= 0;
              return (
                <div key={`${tx.date}-${tx.description}-${i}`} className="finance-row">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="finance-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.description}
                    </div>
                    <div className="finance-meta">
                      {tx.category || 'Uncategorized'} &middot; {tx.date || 'unknown date'}
                      {tx.handledByBot ? <> &middot; <span style={{ color: 'var(--green)' }}>{tx.handledByBot}</span></> : null}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className={`finance-amount ${isIn ? 'in' : 'out'}`}>{fmtSigned(tx.amount)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="card">
          <div className="card-title">Payables &mdash; upcoming</div>
          {upcomingPayables.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              No pending payables.
            </div>
          ) : (
            upcomingPayables.map((p, i) => (
              <div key={`${p.vendor}-${i}`} className="finance-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="finance-name">{p.vendor}</div>
                  <div className="finance-meta">
                    Due {p.dueDate || '—'}
                  </div>
                  <span className={`finance-status ${p.status === 'paid' ? 'paid' : 'pending'}`}>{p.status}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="finance-amount out">{fmtSigned(-Math.abs(p.amount))}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Budget + Subscriptions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {data.budget.length > 0 && (
          <div className="card">
            <div className="card-title">Budget &mdash; this month</div>
            {data.budget.map((b) => (
              <div key={b.id} style={{ padding: '11px 0', borderBottom: '1px solid var(--border-c)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <div className="finance-name">
                    {b.emoji ? <span style={{ marginRight: 6 }}>{b.emoji}</span> : null}
                    {b.name}
                  </div>
                  <div className="finance-amount" style={{ color: 'var(--text2)' }}>
                    {fmtUSD(b.spent)} / {fmtUSD(b.monthlyTarget)}
                  </div>
                </div>
                <div
                  style={{
                    marginTop: 6,
                    height: 4,
                    background: 'var(--bg3)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, b.percentUsed)}%`,
                      height: '100%',
                      background:
                        b.status === 'red' ? 'var(--red)' : b.status === 'yellow' ? 'var(--amber)' : 'var(--green)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {data.subscriptions.length > 0 && (
          <div className="card">
            <div className="card-title">Subscriptions &mdash; monthly equivalents</div>
            {data.subscriptions.slice(0, 8).map((s) => (
              <div key={s.id} className="finance-row">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="finance-name">{s.merchant}</div>
                  <div className="finance-meta">
                    {s.interval}
                    {s.category ? ` · ${s.category}` : ''}
                    {s.nextChargeDate ? ` · next ${s.nextChargeDate}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="finance-amount out">{fmtSigned(-Math.abs(s.monthlyEquivalent))}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Plans · Goals · Campaigns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {goals.length > 0 && (
          <div className="card">
            <div className="card-title">Goals &mdash; tracked progress</div>
            {goals.map((p) => (
              <PlanRow key={p.id} plan={p} />
            ))}
          </div>
        )}
        {campaigns.length > 0 && (
          <div className="card">
            <div className="card-title">Campaigns &mdash; active financial plans</div>
            {campaigns.map((p) => (
              <PlanRow key={p.id} plan={p} />
            ))}
          </div>
        )}
        {activePlans.length === 0 && (
          <div className="card">
            <div className="card-title">Plans &middot; Goals &middot; Campaigns</div>
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
              No active plans yet. Drake will surface campaigns once data comes in.
            </div>
          </div>
        )}
      </div>

      {/* Income sources */}
      {data.incomeSources.length > 0 && (
        <div className="card">
          <div className="card-title">Income sources</div>
          {data.incomeSources.map((src) => (
            <div key={src.id} className="finance-row">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="finance-name">{src.source}</div>
                <div className="finance-meta">
                  {src.interval}
                  {src.nextPayday ? ` · next payday ${src.nextPayday}` : ''}
                  {src.confirmed ? '' : ' · unverified'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="finance-amount in">{fmtSigned(Math.abs(src.amount))}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* System status footer */}
      <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textAlign: 'right' }}>
        {data.systemStatus === 'partial' ? '⚠ partial data' : '✓ all modules ok'} ·{' '}
        generated {new Date(data.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
      </div>
    </div>
  );
}

function PlanRow({ plan }: { plan: V2FinancePlan }) {
  const pct = plan.progressPercent ?? (
    plan.targetValue && plan.currentValue !== null
      ? Math.min(100, Math.max(0, (plan.currentValue / plan.targetValue) * 100))
      : null
  );
  const unit = plan.unit ?? '';
  const fmt = (v: number | null) =>
    v === null
      ? '—'
      : unit === 'USD' || unit === '$'
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
        : `${v.toLocaleString()}${unit ? ` ${unit}` : ''}`;

  return (
    <div style={{ padding: '11px 0', borderBottom: '1px solid var(--border-c)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div>
          <div className="finance-name">{plan.title}</div>
          <div className="finance-meta">
            {plan.type.replace(/_/g, ' ').toLowerCase()} &middot; {plan.managedByBot}
            {plan.targetDate ? ` · target ${plan.targetDate}` : ''}
          </div>
        </div>
        {plan.targetValue !== null && (
          <div className="finance-amount" style={{ color: 'var(--text2)' }}>
            {fmt(plan.currentValue)} / {fmt(plan.targetValue)}
          </div>
        )}
      </div>
      {pct !== null && (
        <div style={{ marginTop: 6, height: 4, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
          <div
            style={{
              width: `${Math.min(100, pct)}%`,
              height: '100%',
              background: pct >= 100 ? 'var(--green)' : pct >= 66 ? 'var(--blue)' : pct >= 33 ? 'var(--amber)' : 'var(--red)',
            }}
          />
        </div>
      )}
      {plan.milestones.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {plan.milestones.slice(0, 4).map((m, i) => (
            <span
              key={`${plan.id}-milestone-${i}`}
              className="badge"
              style={{
                background: m.completedAt ? 'var(--green3)' : 'var(--bg3)',
                color: m.completedAt ? 'var(--green)' : 'var(--text3)',
              }}
            >
              {m.completedAt ? '✓ ' : ''}{m.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaidBar({ onSyncDone }: { onSyncDone: () => void }) {
  const { data, mutate: mutateItems } = useSWR<{ items: Array<{ id: string; institutionName: string; updatedAt: string | null }> }>(
    '/api/plaid/items',
    (url: string) => fetch(url).then((r) => r.json()).catch(() => ({ items: [] })),
    { refreshInterval: 60_000 }
  );
  const [syncing, setSyncing] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);

  const items = data?.items ?? [];

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await fetch('/api/plaid/sync-transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      onSyncDone();
    } finally {
      setSyncing(false);
    }
  }, [onSyncDone]);

  const handleSeed = useCallback(async () => {
    setSeeding(true);
    setSeedError(null);
    try {
      const res = await fetch('/api/plaid/sandbox-seed', { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSeedError(body?.error ?? 'Seed failed');
        return;
      }
      await mutateItems();
      onSyncDone();
    } catch (err) {
      setSeedError(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setSeeding(false);
    }
  }, [mutateItems, onSyncDone]);

  const lastUpdated = (() => {
    const stamps = items.map((i) => (i.updatedAt ? new Date(i.updatedAt).getTime() : 0)).filter(Boolean);
    if (stamps.length === 0) return null;
    return new Date(Math.max(...stamps)).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
  })();

  const institutionLabel = items.length === 0
    ? 'No accounts connected yet.'
    : items.map((i) => i.institutionName).filter(Boolean).join(' · ') || `${items.length} connected`;

  return (
    <div className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div className="card-title" style={{ margin: 0 }}>Plaid</div>
      <div style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontWeight: 600 }}>{institutionLabel}</strong>
        {items.length > 0 && (
          <span style={{ color: 'var(--text3)' }}>
            · syncing balances &amp; transactions from {items.length === 1 ? 'this institution' : 'these institutions'}
            {lastUpdated ? ` · updated ${lastUpdated}` : ''}
          </span>
        )}
      </div>
      {seedError && (
        <div style={{ fontSize: 11, color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>{seedError}</div>
      )}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        {items.length > 0 && (
          <button className="btn-sm" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
        {items.length === 0 && (
          <button className="btn-sm primary" onClick={handleSeed} disabled={seeding}>
            {seeding ? 'Connecting…' : 'Connect sandbox'}
          </button>
        )}
      </div>
    </div>
  );
}

type TxPoint = { date: string; amount: number };

function TransactionSparkline({ transactions }: { transactions: TxPoint[] }) {
  const days = 30;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Bucket transactions by day (net amount = income + negative spend).
  const buckets = new Array<number>(days).fill(0);
  for (const tx of transactions) {
    const d = new Date(tx.date);
    if (isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000);
    if (diffDays >= 0 && diffDays < days) buckets[days - 1 - diffDays] += tx.amount;
  }

  const hasData = buckets.some((v) => v !== 0);
  const max = Math.max(...buckets, 0);
  const min = Math.min(...buckets, 0);
  const range = max - min || 1;

  const width = 100;
  const height = 36;
  const points = buckets.map((v, i) => {
    const x = (i / (days - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
  const areaPath = `M0,${height} L${points.replaceAll(' ', ' L')} L${width},${height} Z`;
  const zeroY = height - ((0 - min) / range) * height;

  const total = buckets.reduce((s, v) => s + v, 0);

  return (
    <div style={{ marginBottom: 10, padding: '8px 2px 6px', borderBottom: '1px solid var(--border-c)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text3)' }}>
          Last {days} days · net cash flow
        </span>
        <span style={{ fontFamily: 'var(--font-rajdhani)', fontSize: 13, fontWeight: 600, color: total >= 0 ? 'var(--green)' : 'var(--red)' }}>
          {fmtSigned(total)}
        </span>
      </div>
      {hasData ? (
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: 40, display: 'block' }}>
          <line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke="var(--border-c)" strokeWidth={0.5} strokeDasharray="1 2" />
          <path d={areaPath} fill="rgba(4, 112, 160, 0.10)" />
          <polyline points={points} fill="none" stroke="var(--green)" strokeWidth={1.2} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text3)', padding: '6px 0' }}>No recent transactions to chart.</div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'pos' | 'neg' | 'neutral' }) {
  const color = tone === 'pos' ? 'var(--green)' : tone === 'neg' ? 'var(--red)' : 'var(--text)';
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color, marginTop: 3, fontFamily: 'var(--font-rajdhani)', letterSpacing: 0.5 }}>
        {value}
      </div>
    </div>
  );
}
