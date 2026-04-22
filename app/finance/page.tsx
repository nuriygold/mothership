'use client';

import useSWR from 'swr';
import { useMemo } from 'react';
import type { V2FinanceOverviewFeed } from '@/lib/v2/types';

const fetcher = async (url: string): Promise<V2FinanceOverviewFeed> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finance overview fetch failed: ${res.status}`);
  return res.json();
};

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

    return { netWorth, cash, spend, income, monthlySubs };
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="section-head">
        <span>
          Finance &mdash; managed by <strong style={{ color: 'var(--green)' }}>Drake</strong> &middot; watched by{' '}
          <strong style={{ color: 'var(--purple)' }}>Champagne Papi</strong>
        </span>
        <span className="sse-indicator"><span className="sse-pulse" /> live</span>
      </div>

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
            <Stat label="Cash on hand"  value={fmtUSD(metrics?.cash ?? 0)}   tone="neutral" />
            <Stat label="Income (MTD)"  value={fmtUSD(metrics?.income ?? 0)} tone="pos" />
            <Stat label="Spend (MTD)"   value={fmtUSD(metrics?.spend ?? 0)}  tone="neg" />
            <Stat label="Subs / month"  value={fmtUSD(metrics?.monthlySubs ?? 0)} tone="neutral" />
          </div>
        </div>
      </div>

      {/* Accounts row */}
      {data.accounts.length > 0 && (
        <div className="card">
          <div className="card-title">Accounts &mdash; /api/v2/finance/overview</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {data.accounts.map((a) => (
              <div
                key={a.id}
                style={{
                  padding: 12,
                  background: 'var(--bg2)',
                  border: '1px solid var(--border-c)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {a.type}
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
                {a.trendPercentage && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                    {a.trendPercentage}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Two-column: Transactions | Payables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="card">
          <div className="card-title">Transactions &mdash; recent</div>
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
