'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { RefreshCw, AlertCircle, CreditCard, Lock, Send, Download, ChevronDown, Zap, CheckCircle2, Tag, TrendingDown } from 'lucide-react';
import type {
  V2FinanceOverviewFeed, V2FinancePlan, V2FinanceEvent,
  V2CashFlowForecast, V2PaydaySchedule,
  V2Subscription, V2IncomeSource, V2NetWorthPoint, V2HealthScore,
} from '@/lib/v2/types';

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`Finance overview fetch failed: ${res.status}`);
    return res.json();
  });

const PLAN_TYPE_LABELS: Record<string, string> = {
  CREDIT_SCORE: 'Credit Score',
  BUDGET: 'Budget',
  SAVINGS: 'Savings',
  DEBT_PAYOFF: 'Debt Payoff',
  INVESTMENT: 'Investment',
  EXPENSE_REDUCTION: 'Expense Reduction',
  CUSTOM: 'Plan',
};

type QuickAction =
  | { label: string; live: true; onClick: () => void | Promise<void> }
  | { label: string; live: false };

function TrendBadge({ trend }: { trend: string }) {
  const isPositive = trend.startsWith('+');
  const isNegative = trend.startsWith('-');
  return (
    <span
      className="text-xs font-semibold"
      style={{ color: isPositive ? '#6EE7B7' : isNegative ? '#F87171' : 'rgba(232,237,245,0.6)' }}
    >
      {isPositive ? '↗' : isNegative ? '↘' : '→'} {trend}
    </span>
  );
}

function exportTransactionsCSV(transactions: V2FinanceOverviewFeed['transactions']) {
  const rows = [['Date', 'Description', 'Category', 'Amount', 'Handled By']];
  for (const tx of transactions) {
    rows.push([tx.date, tx.description, tx.category, String(tx.amount), tx.handledByBot]);
  }
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vault-statement-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Cash Flow Forecast Card ────────────────────────────────────────────────

function CashFlowForecastCard({ forecast }: { forecast: V2CashFlowForecast }) {
  const days = forecast.days;
  const balances = days.map((d) => d.projectedBalance);
  const minBalance = Math.min(...balances);
  const maxBalance = Math.max(forecast.openingBalance, ...balances);
  const range = maxBalance - minBalance || 1;

  // SVG dimensions
  const W = 600;
  const H = 80;
  const PAD_X = 2;
  const PAD_Y = 6;

  // Map a balance value to an SVG y coordinate (higher balance = lower y)
  function toY(val: number) {
    return PAD_Y + (1 - (val - minBalance) / range) * (H - PAD_Y * 2);
  }

  function toX(i: number) {
    return PAD_X + (i / (days.length - 1)) * (W - PAD_X * 2);
  }

  // Build polyline points
  const points = days.map((_, i) => `${toX(i)},${toY(balances[i])}`).join(' ');

  // Find the lowest point index
  const lowestIdx = balances.indexOf(minBalance);
  const lowestX = toX(lowestIdx);
  const lowestY = toY(minBalance);

  // Find days with large scheduled outflows (payables/subscriptions >200)
  const bigOutflowMarkers = days
    .map((d, i) => {
      const total = d.scheduledOutflows.reduce((s, o) => s + o.amount, 0);
      if (total < 200) return null;
      return { i, total, label: d.scheduledOutflows[0]?.label ?? 'Payment', date: d.date };
    })
    .filter(Boolean)
    .slice(0, 3) as Array<{ i: number; total: number; label: string; date: string }>;

  const hasAlert = forecast.lowestPoint.balance < 1000;

  const formatCurrency = (n: number) =>
    '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Build area fill path
  const areaPath =
    `M ${toX(0)},${toY(balances[0])} ` +
    days.slice(1).map((_, i) => `L ${toX(i + 1)},${toY(balances[i + 1])}`).join(' ') +
    ` L ${toX(days.length - 1)},${H} L ${toX(0)},${H} Z`;

  const lineColor = hasAlert ? '#F87171' : '#38BDF8';
  const areaColor = hasAlert ? 'rgba(248,113,113,0.10)' : 'rgba(56,189,248,0.10)';

  return (
    <div
      className="rounded-3xl p-5"
      style={{
        background: 'rgba(6,18,30,0.93)',
        border: `1px solid ${hasAlert ? 'rgba(248,113,113,0.25)' : 'rgba(56,189,248,0.15)'}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <TrendingDown size={14} style={{ color: hasAlert ? '#F87171' : '#38BDF8' }} />
          <h2 className="text-base font-semibold" style={{ color: '#E8EDF5' }}>
            60-Day Cash Flow
          </h2>
          {/* Confidence badge */}
          {forecast.confidence && (() => {
            const c = forecast.confidence;
            const badgeColor =
              c.label === 'High' ? '#6EE7B7' :
              c.label === 'Good' ? '#93C5FD' :
              c.label === 'Fair' ? '#FDE68A' : '#F87171';
            return (
              <span
                title={`Confidence factors:\n${c.factors.join('\n')}`}
                className="text-[10px] rounded-full px-2 py-0.5 cursor-help"
                style={{
                  background: `${badgeColor}15`,
                  border: `1px solid ${badgeColor}35`,
                  color: badgeColor,
                }}
              >
                {c.score}% confidence · {c.label}
              </span>
            );
          })()}
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: 'rgba(232,237,245,0.55)' }}>
          <span>Opening {formatCurrency(forecast.openingBalance)}</span>
          <span
            className="font-semibold"
            style={{ color: hasAlert ? '#F87171' : '#6EE7B7' }}
          >
            Low {formatCurrency(forecast.lowestPoint.balance)} · {formatDate(forecast.lowestPoint.date)}
          </span>
        </div>
      </div>

      {/* Sparkline */}
      <div className="relative" style={{ height: H }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          {/* Zero / floor line at threshold $1k */}
          {minBalance < 1000 && (
            <line
              x1={0}
              x2={W}
              y1={toY(1000)}
              y2={toY(1000)}
              stroke="rgba(248,113,113,0.30)"
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          )}

          {/* Area fill */}
          <path d={areaPath} fill={areaColor} />

          {/* Main sparkline */}
          <polyline
            points={points}
            fill="none"
            stroke={lineColor}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Lowest point marker */}
          {lowestIdx > 0 && lowestIdx < days.length - 1 && (
            <circle cx={lowestX} cy={lowestY} r={3} fill={lineColor} />
          )}

          {/* Big outflow tick marks */}
          {bigOutflowMarkers.map((m) => {
            const x = toX(m.i);
            return (
              <line
                key={m.i}
                x1={x} x2={x}
                y1={H - 6} y2={H}
                stroke="rgba(253,211,77,0.60)"
                strokeWidth={1.5}
              />
            );
          })}
        </svg>

        {/* Week labels along bottom */}
        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-0.5">
          {[0, 7, 14, 21, 28, 35, 42, 49, 59].map((dayOffset) => {
            const d = days[dayOffset];
            if (!d) return null;
            return (
              <span
                key={dayOffset}
                className="text-[9px]"
                style={{ color: 'rgba(232,237,245,0.30)' }}
              >
                {formatDate(d.date)}
              </span>
            );
          })}
        </div>
      </div>

      {/* Alerts — low cash + non-liquid warning */}
      {forecast.alerts.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {forecast.alerts.map((alert, i) => {
            const isWarning = alert.includes('non-liquid');
            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
                style={{
                  background: isWarning ? 'rgba(251,146,60,0.08)' : 'rgba(248,113,113,0.08)',
                  border: `1px solid ${isWarning ? 'rgba(251,146,60,0.20)' : 'rgba(248,113,113,0.20)'}`,
                  color: isWarning ? '#FED7AA' : '#FCA5A5',
                }}
              >
                <AlertCircle size={11} style={{ flexShrink: 0 }} />
                {alert}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom row: paydays + outflow pills */}
      <div className="mt-3 space-y-2">
        {/* Payday schedules — green income pills */}
        {(forecast.paydaySchedules ?? []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(forecast.paydaySchedules as V2PaydaySchedule[]).map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
                style={{
                  background: 'rgba(110,231,183,0.08)',
                  border: '1px solid rgba(110,231,183,0.20)',
                  color: '#6EE7B7',
                }}
              >
                <span style={{ color: 'rgba(110,231,183,0.55)' }}>↓</span>
                <span>{p.source}</span>
                <span style={{ color: 'rgba(110,231,183,0.55)' }}>·</span>
                <span className="font-semibold">{formatCurrency(p.amount)}</span>
                <span style={{ color: 'rgba(110,231,183,0.50)' }}>{p.intervalLabel}</span>
                <span style={{ color: 'rgba(110,231,183,0.50)' }}>next {formatDate(p.nextDate)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Upcoming large outflow pills */}
        {bigOutflowMarkers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {bigOutflowMarkers.map((m, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
                style={{
                  background: 'rgba(253,211,77,0.08)',
                  border: '1px solid rgba(253,211,77,0.20)',
                  color: '#FDE68A',
                }}
              >
                <span>{formatDate(m.date)}</span>
                <span style={{ color: 'rgba(253,211,77,0.60)' }}>·</span>
                <span>{m.label}</span>
                <span style={{ color: '#FDE68A', fontWeight: 600 }}>{formatCurrency(m.total)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Liquidity badge — only when accounts are typed */}
      {forecast.liquidAccountsOnly && (
        <div className="mt-3 flex items-center gap-1.5 text-[10px]" style={{ color: 'rgba(232,237,245,0.30)' }}>
          <Lock size={9} />
          Liquid accounts only · investments and retirement excluded
        </div>
      )}
    </div>
  );
}

// ─── Finance Health Card ─────────────────────────────────────────────────────

function FinanceHealthCard({ health }: { health: V2HealthScore }) {
  const { score, message, breakdown } = health;

  const scoreColor =
    score >= 80 ? '#6EE7B7' :
    score >= 60 ? '#FDE68A' : '#F87171';

  const scoreGlow =
    score >= 80 ? '0 0 20px rgba(110,231,183,0.25)' :
    score >= 60 ? '0 0 20px rgba(253,211,77,0.20)' :
    '0 0 20px rgba(248,113,113,0.25)';

  const components = [
    { label: 'Liquidity',     value: breakdown.liquidityBuffer,    weight: '35%' },
    { label: 'Budget',        value: breakdown.budgetCompliance,   weight: '25%' },
    { label: 'Subscriptions', value: breakdown.subscriptionBurden, weight: '15%' },
    { label: 'Forecast',      value: breakdown.forecastRisk,       weight: '15%' },
    { label: 'Anomalies',     value: breakdown.anomalyLoad,        weight: '10%' },
  ];

  return (
    <div
      className="rounded-3xl p-5"
      style={{ background: 'rgba(6,18,30,0.96)', border: `1px solid ${scoreColor}22` }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div
            className="text-4xl font-bold tabular-nums"
            style={{ color: scoreColor, textShadow: scoreGlow, lineHeight: 1 }}
          >
            {score}
          </div>
          <div className="text-xs mt-1 font-medium" style={{ color: 'rgba(232,237,245,0.60)' }}>
            {message}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'rgba(232,237,245,0.30)' }}>
            Health Score
          </div>
          {/* Ring indicator */}
          <svg width={44} height={44} viewBox="0 0 44 44">
            <circle cx={22} cy={22} r={18} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
            <circle
              cx={22} cy={22} r={18}
              fill="none"
              stroke={scoreColor}
              strokeWidth={4}
              strokeDasharray={`${(score / 100) * 113} 113`}
              strokeLinecap="round"
              transform="rotate(-90 22 22)"
              style={{ transition: 'stroke-dasharray 0.6s ease' }}
            />
          </svg>
        </div>
      </div>

      {/* Component bars */}
      <div className="mt-4 space-y-2">
        {components.map((c) => {
          const barColor = c.value >= 70 ? '#6EE7B7' : c.value >= 40 ? '#FDE68A' : '#F87171';
          return (
            <div key={c.label}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px]" style={{ color: 'rgba(232,237,245,0.45)' }}>
                  {c.label}
                  <span className="ml-1" style={{ color: 'rgba(232,237,245,0.25)' }}>{c.weight}</span>
                </span>
                <span className="text-[10px] font-semibold" style={{ color: barColor }}>{c.value}</span>
              </div>
              <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-1 rounded-full transition-all"
                  style={{ width: `${c.value}%`, background: barColor }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Net Worth Card ──────────────────────────────────────────────────────────

function NetWorthCard({ history }: { history: V2NetWorthPoint[] }) {
  if (history.length === 0) return null;

  const latest = history[history.length - 1];
  const prev   = history.length > 1 ? history[history.length - 2] : null;
  const delta  = prev ? latest.netWorth - prev.netWorth : 0;

  const netWorths = history.map((h) => h.netWorth);
  const minNW = Math.min(...netWorths);
  const maxNW = Math.max(...netWorths);
  const range = maxNW - minNW || 1;

  const W = 400; const H = 48; const PAD = 2;
  const toX = (i: number) => PAD + (i / (netWorths.length - 1)) * (W - PAD * 2);
  const toY = (v: number) => PAD + (1 - (v - minNW) / range) * (H - PAD * 2);

  const points = netWorths.map((v, i) => `${toX(i)},${toY(v)}`).join(' ');
  const areaPath =
    `M ${toX(0)},${toY(netWorths[0])} ` +
    netWorths.slice(1).map((v, i) => `L ${toX(i + 1)},${toY(v)}`).join(' ') +
    ` L ${toX(netWorths.length - 1)},${H} L ${toX(0)},${H} Z`;

  const isPositive = latest.netWorth >= 0;
  const lineColor = isPositive ? '#6EE7B7' : '#F87171';

  const fmt = (n: number) =>
    (n >= 0 ? '+' : '-') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const fmtAbs = (n: number) =>
    (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

  return (
    <div
      className="rounded-3xl p-5"
      style={{ background: 'rgba(6,18,30,0.96)', border: '1px solid rgba(56,189,248,0.12)' }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(232,237,245,0.35)' }}>
            Net Worth
          </div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: isPositive ? '#6EE7B7' : '#F87171' }}>
            {fmtAbs(latest.netWorth)}
          </div>
          {delta !== 0 && (
            <div className="text-[11px] mt-0.5 font-medium" style={{ color: delta >= 0 ? '#6EE7B7' : '#F87171' }}>
              {fmt(delta)} since yesterday
            </div>
          )}
        </div>
        <div className="text-right text-xs space-y-0.5" style={{ color: 'rgba(232,237,245,0.45)' }}>
          <div>Assets <span className="font-semibold" style={{ color: '#6EE7B7' }}>{fmtAbs(latest.assets)}</span></div>
          <div>Liabilities <span className="font-semibold" style={{ color: '#F87171' }}>{fmtAbs(latest.liabilities)}</span></div>
        </div>
      </div>

      {/* Sparkline */}
      {history.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 48, display: 'block' }}>
          <path d={areaPath} fill={`${lineColor}12`} />
          <polyline points={points} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
      )}

      <div className="mt-1 text-[9px]" style={{ color: 'rgba(232,237,245,0.25)' }}>
        Last {history.length} day{history.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

// ─── Income Sources Card ──────────────────────────────────────────────────────

function IncomeSourcesCard({
  sources,
  onMutate,
}: {
  sources: V2IncomeSource[];
  onMutate?: () => void;
}) {
  const [pending, setPending] = useState<Record<string, string>>({});   // id → action
  const [adjusting, setAdjusting] = useState<string | null>(null);       // id being interval-edited

  if (sources.length === 0) return null;

  const fmt = (n: number) =>
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const totalMonthly = sources
    .filter((src) => src.confirmed || true)   // show all in total
    .reduce((s, src) => {
      const mult = src.interval === 'weekly' ? 4.33 : src.interval === 'biweekly' ? 2.167 : 1;
      return s + src.amount * mult;
    }, 0);

  async function doAction(id: string, action: string, interval?: string) {
    setPending((p) => ({ ...p, [id]: action }));
    try {
      await fetch('/api/v2/finance/income-sources', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, ...(interval ? { interval } : {}) }),
      });
      onMutate?.();
    } finally {
      setPending((p) => { const n = { ...p }; delete n[id]; return n; });
      setAdjusting(null);
    }
  }

  return (
    <div
      className="rounded-3xl p-5"
      style={{ background: 'rgba(6,18,30,0.93)', border: '1px solid rgba(110,231,183,0.15)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-semibold" style={{ color: '#E8EDF5' }}>Income Sources</h2>
        <span className="text-xs ml-auto" style={{ color: 'rgba(232,237,245,0.40)' }}>
          ~{fmt(totalMonthly)}/mo detected
        </span>
      </div>

      <div className="space-y-3">
        {sources.map((src) => {
          const isBusy = pending[src.id];
          return (
            <div
              key={src.id}
              className="rounded-2xl px-3 py-2.5"
              style={{
                background: src.confirmed ? 'rgba(110,231,183,0.06)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${src.confirmed ? 'rgba(110,231,183,0.15)' : 'rgba(255,255,255,0.07)'}`,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate" style={{ color: '#E8EDF5' }}>{src.source}</p>
                    {src.confirmed && (
                      <span className="text-[9px] rounded-full px-1.5 py-0.5 flex-shrink-0"
                        style={{ background: 'rgba(110,231,183,0.15)', color: '#6EE7B7' }}>
                        confirmed
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: 'rgba(232,237,245,0.45)' }}>
                    {src.interval} · last seen {fmtDate(src.lastSeen)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold" style={{ color: '#6EE7B7' }}>{fmt(src.amount)}</p>
                  {src.nextPayday && (
                    <p className="text-[10px]" style={{ color: 'rgba(110,231,183,0.55)' }}>
                      next {fmtDate(src.nextPayday)}
                    </p>
                  )}
                </div>
              </div>

              {/* Action row */}
              {adjusting === src.id ? (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px]" style={{ color: 'rgba(232,237,245,0.45)' }}>Set interval:</span>
                  {(['weekly', 'biweekly', 'monthly'] as const).map((iv) => (
                    <button
                      key={iv}
                      disabled={!!isBusy}
                      onClick={() => doAction(src.id, 'adjust-interval', iv)}
                      className="text-[10px] rounded-full px-2 py-0.5 capitalize transition-opacity hover:opacity-80"
                      style={{
                        background: iv === src.interval ? 'rgba(110,231,183,0.20)' : 'rgba(255,255,255,0.08)',
                        border: iv === src.interval ? '1px solid rgba(110,231,183,0.35)' : '1px solid rgba(255,255,255,0.12)',
                        color: iv === src.interval ? '#6EE7B7' : 'rgba(232,237,245,0.60)',
                        cursor: isBusy ? 'wait' : 'pointer',
                      }}
                    >
                      {iv}
                    </button>
                  ))}
                  <button
                    onClick={() => setAdjusting(null)}
                    className="text-[10px] ml-auto"
                    style={{ color: 'rgba(232,237,245,0.35)', cursor: 'pointer' }}
                  >
                    cancel
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-1.5">
                  {!src.confirmed && (
                    <button
                      disabled={!!isBusy}
                      onClick={() => doAction(src.id, 'confirm')}
                      className="text-[10px] rounded-full px-2 py-0.5 transition-opacity hover:opacity-80"
                      style={{
                        background: 'rgba(110,231,183,0.10)',
                        border: '1px solid rgba(110,231,183,0.25)',
                        color: '#6EE7B7',
                        cursor: isBusy ? 'wait' : 'pointer',
                      }}
                    >
                      {isBusy === 'confirm' ? '…' : 'Confirm'}
                    </button>
                  )}
                  <button
                    disabled={!!isBusy}
                    onClick={() => setAdjusting(src.id)}
                    className="text-[10px] rounded-full px-2 py-0.5 transition-opacity hover:opacity-80"
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: 'rgba(232,237,245,0.55)',
                      cursor: isBusy ? 'wait' : 'pointer',
                    }}
                  >
                    Adjust interval
                  </button>
                  <button
                    disabled={!!isBusy}
                    onClick={() => doAction(src.id, 'ignore')}
                    className="text-[10px] rounded-full px-2 py-0.5 transition-opacity hover:opacity-80 ml-auto"
                    style={{
                      background: 'rgba(248,113,113,0.06)',
                      border: '1px solid rgba(248,113,113,0.15)',
                      color: '#FCA5A5',
                      cursor: isBusy ? 'wait' : 'pointer',
                    }}
                  >
                    {isBusy === 'ignore' ? '…' : 'Ignore'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Subscriptions Card ───────────────────────────────────────────────────────

function SubscriptionsCard({
  subscriptions,
  highlightCluster,
}: {
  subscriptions: V2Subscription[];
  highlightCluster?: string | null;
}) {
  if (subscriptions.length === 0) return null;

  const fmt = (n: number) =>
    '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

  // Simple cluster keyword check (mirrors subscriptionOverlapDetector)
  const CLUSTER_KEYWORDS: Record<string, string[]> = {
    'AI Assistants':    ['chatgpt','openai','claude','anthropic','gemini','copilot','perplexity','grok'],
    'Video Streaming':  ['netflix','hulu','max','hbo','disney','paramount','peacock','apple tv','youtube premium'],
    'Music Streaming':  ['spotify','apple music','tidal','amazon music','deezer'],
    'Cloud Storage':    ['dropbox','google drive','google one','icloud','onedrive','box'],
    'Project Management': ['notion','asana','monday','linear','basecamp','trello','clickup'],
    'Password Managers':  ['1password','lastpass','bitwarden','dashlane'],
    'VPN Services':       ['nordvpn','expressvpn','mullvad','protonvpn','surfshark'],
    'Design & Creative':  ['figma','adobe','canva','sketch','framer','webflow'],
  };

  function inCluster(merchant: string, cluster: string): boolean {
    const kws = CLUSTER_KEYWORDS[cluster] ?? [];
    const norm = merchant.toLowerCase();
    return kws.some((kw) => norm.includes(kw));
  }

  const totalMonthly = subscriptions.reduce((s, sub) => s + sub.monthlyEquivalent, 0);

  return (
    <div
      className="rounded-3xl p-5"
      style={{ background: 'rgba(6,18,30,0.93)', border: '1px solid rgba(167,139,250,0.15)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-base font-semibold" style={{ color: '#E8EDF5' }}>Subscriptions</h2>
        <span
          className="text-xs rounded-full px-2 py-0.5 ml-1"
          style={{ background: 'rgba(167,139,250,0.12)', color: '#C4B5FD' }}
        >
          {subscriptions.length}
        </span>
        <span className="text-xs ml-auto" style={{ color: 'rgba(232,237,245,0.40)' }}>
          ${totalMonthly.toFixed(0)}/mo total
        </span>
      </div>

      <div className="space-y-1">
        {/* Header row */}
        <div
          className="grid text-[10px] uppercase tracking-wider pb-1.5 border-b"
          style={{
            gridTemplateColumns: '1fr 72px 72px 80px 80px',
            color: 'rgba(232,237,245,0.30)',
            borderColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <span>Service</span>
          <span className="text-right">Amount</span>
          <span className="text-right">Interval</span>
          <span className="text-right">Monthly</span>
          <span className="text-right">Next charge</span>
        </div>

        {subscriptions.map((sub) => {
          const isHighlighted =
            highlightCluster ? inCluster(sub.merchant, highlightCluster) : false;
          return (
            <div
              key={sub.id}
              className="grid items-center py-1.5 rounded-lg px-1 -mx-1 transition-colors"
              style={{
                gridTemplateColumns: '1fr 72px 72px 80px 80px',
                background: isHighlighted ? 'rgba(253,211,77,0.07)' : undefined,
                outline: isHighlighted ? '1px solid rgba(253,211,77,0.20)' : undefined,
              }}
            >
              <div className="min-w-0">
                <span className="text-sm font-medium truncate block" style={{ color: '#E8EDF5' }}>
                  {sub.merchant}
                </span>
                {sub.category && (
                  <span className="text-[10px]" style={{ color: 'rgba(232,237,245,0.40)' }}>{sub.category}</span>
                )}
              </div>
              <span className="text-right text-sm" style={{ color: 'rgba(232,237,245,0.70)' }}>
                {fmt(sub.amount)}
              </span>
              <span className="text-right text-xs capitalize" style={{ color: 'rgba(232,237,245,0.45)' }}>
                {sub.interval}
              </span>
              <span className="text-right text-sm font-semibold" style={{ color: '#C4B5FD' }}>
                {fmt(sub.monthlyEquivalent)}
              </span>
              <span className="text-right text-xs" style={{ color: 'rgba(232,237,245,0.45)' }}>
                {fmtDate(sub.nextChargeDate)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer total */}
      <div
        className="flex justify-between items-center pt-3 mt-2 text-sm font-semibold border-t"
        style={{ borderColor: 'rgba(255,255,255,0.06)', color: '#E8EDF5' }}
      >
        <span style={{ color: 'rgba(232,237,245,0.50)' }}>Total monthly</span>
        <span style={{ color: '#C4B5FD' }}>${totalMonthly.toFixed(2)}</span>
      </div>
    </div>
  );
}

function PlanProgressCard({ plan }: { plan: V2FinancePlan }) {
  const targetDate = plan.targetDate
    ? new Date(plan.targetDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#E8EDF5' }}>{plan.title}</p>
          {plan.goal && (
            <p className="text-xs mt-0.5" style={{ color: 'rgba(232,237,245,0.60)' }}>{plan.goal}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: plan.status === 'ACTIVE' ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.08)',
              color: plan.status === 'ACTIVE' ? '#6EE7B7' : 'rgba(232,237,245,0.55)',
            }}
          >
            {plan.status.charAt(0) + plan.status.slice(1).toLowerCase()}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px]"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(232,237,245,0.55)' }}
          >
            {PLAN_TYPE_LABELS[plan.type] ?? plan.type}
          </span>
        </div>
      </div>

      {plan.currentValue != null && plan.targetValue != null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs" style={{ color: 'rgba(232,237,245,0.60)' }}>
            <span>
              {plan.currentValue.toLocaleString()}{plan.unit ? ` ${plan.unit}` : ''} of{' '}
              {plan.targetValue.toLocaleString()}{plan.unit ? ` ${plan.unit}` : ''}
            </span>
            {plan.progressPercent != null && (
              <span style={{ color: '#C9A84C', fontWeight: 600 }}>{plan.progressPercent}%</span>
            )}
          </div>
          <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.10)' }}>
            <div
              className="h-1.5 rounded-full"
              style={{
                width: `${plan.progressPercent ?? 0}%`,
                background: 'linear-gradient(to right, #C9A84C, #8B5A8A)',
                boxShadow: '0 0 6px rgba(201,168,76,0.3)',
              }}
            />
          </div>
        </div>
      )}

      {plan.milestones.length > 0 && (
        <div className="space-y-1">
          {plan.milestones.map((m, i) => (
            <div key={`${plan.id}-m-${i}`} className="flex items-center gap-2 text-xs">
              <div
                className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{
                  background: m.completedAt ? '#C9A84C' : 'transparent',
                  border: m.completedAt ? 'none' : '1px solid rgba(232,237,245,0.25)',
                }}
              />
              <span
                style={{
                  color: m.completedAt ? 'rgba(232,237,245,0.50)' : '#E8EDF5',
                  textDecoration: m.completedAt ? 'line-through' : 'none',
                }}
              >
                {m.label}
              </span>
              {m.targetValue != null && (
                <span className="ml-auto" style={{ color: 'rgba(232,237,245,0.60)' }}>
                  {m.targetValue.toLocaleString()}{plan.unit ? ` ${plan.unit}` : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px]" style={{ color: 'rgba(232,237,245,0.45)' }}>
        <span>Managed by {plan.managedByBot}</span>
        {targetDate && <span>Target: {targetDate}</span>}
      </div>
    </div>
  );
}

const COMMON_CATEGORIES = [
  'utilities', 'groceries', 'dining', 'transportation', 'subscription',
  'healthcare', 'insurance', 'entertainment', 'salary', 'transfer',
  'rent', 'mortgage', 'fuel', 'refund', 'general',
];

type PendingMerchant = {
  id: string;
  merchantName: string;
  transactionCount: number;
  lastSeen: string;
};

function MerchantCategorizer({
  merchants,
  onCategorized,
}: {
  merchants: PendingMerchant[];
  onCategorized: () => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [done, setDone] = useState<Set<string>>(new Set());

  const visible = merchants.filter((m) => !done.has(m.id));
  if (visible.length === 0) return null;

  async function handleCategory(merchant: PendingMerchant, category: string) {
    setSaving(merchant.id);
    try {
      await fetch('/api/v2/finance/merchants', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantName: merchant.merchantName, category }),
      });
      setDone((prev) => new Set(prev).add(merchant.id));
      onCategorized();
    } finally {
      setSaving(null);
    }
  }

  return (
    <div
      className="rounded-3xl p-5"
      style={{ background: 'rgba(14,10,26,0.97)', border: '1px solid rgba(234,179,8,0.20)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Tag className="w-4 h-4" style={{ color: '#EAB308' }} />
        <h2 className="text-base font-semibold" style={{ color: '#E8EDF5' }}>New Merchants</h2>
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: 'rgba(234,179,8,0.15)', color: '#EAB308' }}
        >
          {visible.length} uncategorized
        </span>
      </div>
      <div className="space-y-3">
        {visible.map((m) => {
          const isSaving = saving === m.id;
          return (
            <div
              key={m.id}
              className="rounded-2xl p-3 space-y-2"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold capitalize" style={{ color: '#E8EDF5' }}>
                    {m.merchantName}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(232,237,245,0.40)' }}>
                    {m.transactionCount} transaction{m.transactionCount !== 1 ? 's' : ''} ·{' '}
                    last {new Date(m.lastSeen).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
              {/* Quick-pick category chips */}
              <div className="flex flex-wrap gap-1.5">
                {COMMON_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    disabled={isSaving}
                    onClick={() => handleCategory(m, cat)}
                    className="rounded-full px-2.5 py-1 text-[10px] font-medium capitalize"
                    style={{
                      background: 'rgba(255,255,255,0.07)',
                      color: 'rgba(232,237,245,0.70)',
                      border: '1px solid rgba(255,255,255,0.10)',
                      cursor: isSaving ? 'default' : 'pointer',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {/* Custom input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Custom category…"
                  value={custom[m.id] ?? ''}
                  onChange={(e) => setCustom((prev) => ({ ...prev, [m.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && custom[m.id]?.trim()) {
                      handleCategory(m, custom[m.id].trim());
                    }
                  }}
                  disabled={isSaving}
                  className="flex-1 rounded-xl px-3 py-1.5 text-xs"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#E8EDF5',
                    outline: 'none',
                  }}
                />
                <button
                  disabled={isSaving || !custom[m.id]?.trim()}
                  onClick={() => custom[m.id]?.trim() && handleCategory(m, custom[m.id].trim())}
                  className="rounded-xl px-3 py-1.5 text-xs font-semibold"
                  style={{
                    background: isSaving || !custom[m.id]?.trim()
                      ? 'rgba(255,255,255,0.04)'
                      : 'rgba(234,179,8,0.18)',
                    color: isSaving || !custom[m.id]?.trim()
                      ? 'rgba(232,237,245,0.30)'
                      : '#EAB308',
                    border: '1px solid rgba(234,179,8,0.25)',
                    cursor: isSaving || !custom[m.id]?.trim() ? 'default' : 'pointer',
                  }}
                >
                  {isSaving ? '…' : 'Save'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  BILL_DUE: 'Bill Due',
  TRANSACTION_DETECTED: 'Transaction',
  SUBSCRIPTION_DETECTED: 'Subscription',
  PAYMENT_MADE: 'Payment Made',
  PLAN_MILESTONE: 'Milestone',
  FINANCIAL_EMAIL: 'Financial Email',
  PLAN_PROGRESS: 'Plan Progress',
  BUDGET_THRESHOLD: 'Budget Alert',
  UNUSUAL_CHARGE: 'Unusual Charge',
  SUBSCRIPTION_PRICE_CHANGE: 'Price Increase',
  CATEGORY_SPIKE: 'Spending Spike',
  LOW_CASH_FORECAST: 'Cash Flow Alert',
  INCOME_SCHEDULE_DETECTED: 'Income Schedule',
  SUBSCRIPTION_OVERLAP: 'Subscription Overlap',
  ALERT: 'Alert',
};

const PRIORITY_STYLES: Record<string, { dot: string; label: string }> = {
  critical: { dot: '#F87171', label: 'Critical' },
  high:     { dot: '#FB923C', label: 'High' },
  normal:   { dot: '#C4B5FD', label: 'Normal' },
  low:      { dot: 'rgba(232,237,245,0.35)', label: 'Low' },
};

// Anomaly event types get a warning (orange) tint in the feed
const ANOMALY_EVENT_TYPES = new Set([
  'UNUSUAL_CHARGE',
  'SUBSCRIPTION_PRICE_CHANGE',
  'CATEGORY_SPIKE',
  'LOW_CASH_FORECAST',
]);

// Cost-saving opportunity events get a yellow/amber tint
const SAVINGS_EVENT_TYPES = new Set([
  'SUBSCRIPTION_OVERLAP',
]);

// Income events get a green tint (positive signal)
const INCOME_EVENT_TYPES = new Set([
  'INCOME_SCHEDULE_DETECTED',
]);

function eventSummary(event: V2FinanceEvent): string {
  const p = event.payload as Record<string, unknown>;
  switch (event.type) {
    case 'BILL_DUE':
      return `${p.vendor ?? 'Vendor'} — $${Number(p.amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}${p.dueDate ? ` due ${p.dueDate}` : ''}`;
    case 'TRANSACTION_DETECTED':
      return `${p.description ?? 'Transaction'} · ${p.account ?? ''} · ${p.category ?? ''}`;
    case 'SUBSCRIPTION_DETECTED':
      return `${p.merchant ?? 'Merchant'} — $${Number(p.amount ?? 0).toFixed(2)}/${p.interval ?? 'recurring'}`;
    case 'PLAN_PROGRESS':
      return `Plan progress: ${p.progressPercent ?? '?'}%`;
    case 'FINANCIAL_EMAIL':
      return `${p.vendor ?? 'Sender'}${p.dueDate ? ` — due ${p.dueDate}` : ''}${p.actionRequired ? ' · Action required' : ''}`;
    case 'BUDGET_THRESHOLD':
      return `${p.emoji ?? ''} ${String(p.categoryName ?? 'Category').charAt(0).toUpperCase() + String(p.categoryName ?? '').slice(1)} — ${p.percentUsed}% of $${Number(p.monthlyTarget ?? 0).toLocaleString()} budget used`;
    case 'UNUSUAL_CHARGE': {
      const cap = (s: unknown) => String(s ?? '').replace(/\b\w/g, (c) => c.toUpperCase());
      return `${cap(p.merchant)} charged $${Number(p.amount ?? 0).toFixed(2)} — typical $${Number(p.typicalAmount ?? 0).toFixed(2)} (${p.multiplier}×)`;
    }
    case 'SUBSCRIPTION_PRICE_CHANGE': {
      const cap = (s: unknown) => String(s ?? '').replace(/\b\w/g, (c) => c.toUpperCase());
      return `${cap(p.merchant)} $${Number(p.oldAmount ?? 0).toFixed(2)} → $${Number(p.newAmount ?? 0).toFixed(2)} (+${p.changePct}%)`;
    }
    case 'CATEGORY_SPIKE': {
      const cat = String(p.categoryName ?? '');
      return `${cat.charAt(0).toUpperCase() + cat.slice(1)} — $${Number(p.thisWeekSpend ?? 0).toFixed(0)} this week vs avg $${Number(p.avgWeeklySpend ?? 0).toFixed(0)} (${p.multiplier}×)`;
    }
    case 'LOW_CASH_FORECAST': {
      const low = Number(p.lowestBalance ?? 0);
      const date = String(p.lowestDate ?? '');
      const threshold = Number(p.threshold ?? 1000);
      const dateStr = date ? ` on ${new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '';
      return `Projected balance $${low.toLocaleString('en-US', { minimumFractionDigits: 0 })}${dateStr} — below $${threshold.toLocaleString()} threshold`;
    }
    case 'INCOME_SCHEDULE_DETECTED': {
      const cap = (s: unknown) => String(s ?? '').replace(/\b\w/g, (c) => c.toUpperCase());
      return `${cap(p.employer)} — $${Number(p.amount ?? 0).toFixed(2)}/${p.interval ?? 'recurring'} detected`;
    }
    case 'SUBSCRIPTION_OVERLAP': {
      const services = Array.isArray(p.services) ? (p.services as string[]) : [];
      const cost = Number(p.monthlyCost ?? 0);
      const cluster = String(p.clusterName ?? 'Services');
      return `${cluster}: ${services.join(', ')} — $${cost.toFixed(0)}/mo combined`;
    }
    default:
      return event.type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

type ResolveActionConfig = { label: string; color: string; textColor: string; border: string };

function getResolveActions(event: V2FinanceEvent): {
  primary: ResolveActionConfig;
  secondary?: { label: string };
} {
  const green  = { color: 'rgba(74,222,128,0.15)',  textColor: '#4ADE80',              border: '1px solid rgba(74,222,128,0.25)' };
  const amber  = { color: 'rgba(251,146,60,0.15)',   textColor: '#FB923C',              border: '1px solid rgba(251,146,60,0.25)' };
  const indigo = { color: 'rgba(99,102,241,0.15)',   textColor: '#818CF8',              border: '1px solid rgba(99,102,241,0.25)' };
  const muted  = { color: 'rgba(255,255,255,0.06)',  textColor: 'rgba(232,237,245,0.40)', border: '1px solid rgba(255,255,255,0.09)' };

  switch (event.type) {
    case 'BILL_DUE':
      return { primary: { label: 'Mark Paid',    ...green  }, secondary: { label: 'Dismiss'      } };
    case 'FINANCIAL_EMAIL':
      return { primary: { label: 'Handled',      ...green  }, secondary: { label: 'Not Relevant' } };
    case 'TRANSACTION_DETECTED':
      return { primary: { label: 'Looks Right',  ...green  } };
    case 'UNUSUAL_CHARGE':
      return { primary: { label: 'Understood',   ...amber  }, secondary: { label: 'Dismiss'      } };
    case 'SUBSCRIPTION_PRICE_CHANGE':
      return { primary: { label: 'Accepted',     ...amber  }, secondary: { label: 'Dismiss'      } };
    case 'CATEGORY_SPIKE':
    case 'LOW_CASH_FORECAST':
      return { primary: { label: 'On It',        ...amber  }, secondary: { label: 'Dismiss'      } };
    case 'BUDGET_THRESHOLD':
      return { primary: { label: 'Acknowledged', ...amber  }, secondary: { label: 'Dismiss'      } };
    case 'INCOME_SCHEDULE_DETECTED':
      return { primary: { label: 'Confirmed',    ...green  }, secondary: { label: 'Not Mine'     } };
    case 'PAYMENT_MADE':
      return { primary: { label: 'Got It',       ...indigo } };
    case 'PLAN_MILESTONE':
    case 'PLAN_PROGRESS':
      return { primary: { label: 'Noted',        ...indigo } };
    default:
      return { primary: { label: 'Dismiss',      ...muted  } };
  }
}

function SubscriptionActions({
  event,
  onDone,
}: {
  event: V2FinanceEvent;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'working'>('idle');
  const p = event.payload as Record<string, unknown>;

  async function call(action: 'confirm-subscription' | 'ignore-subscription') {
    setStatus('working');
    await fetch('/api/v2/finance/merchants', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantName: String(p.merchant ?? ''),
        action,
        eventId: event.id,
      }),
    });
    onDone();
  }

  const busy = status === 'working';

  return (
    <div className="flex gap-1.5 flex-shrink-0">
      <button
        disabled={busy}
        onClick={() => call('confirm-subscription')}
        className="rounded-xl px-2.5 py-1.5 text-[10px] font-semibold"
        style={{
          background: busy ? 'rgba(255,255,255,0.04)' : 'rgba(74,222,128,0.15)',
          color: busy ? 'rgba(232,237,245,0.30)' : '#6EE7B7',
          border: '1px solid rgba(74,222,128,0.25)',
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        {busy ? '…' : 'Confirm'}
      </button>
      <button
        disabled={busy}
        onClick={() => call('ignore-subscription')}
        className="rounded-xl px-2.5 py-1.5 text-[10px] font-semibold"
        style={{
          background: busy ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)',
          color: busy ? 'rgba(232,237,245,0.30)' : 'rgba(232,237,245,0.55)',
          border: '1px solid rgba(255,255,255,0.10)',
          cursor: busy ? 'default' : 'pointer',
        }}
      >
        Ignore
      </button>
    </div>
  );
}

function ActionFeed({
  events,
  onResolve,
  onHighlightCluster,
}: {
  events: V2FinanceEvent[];
  onResolve: (id: string) => Promise<void>;
  onHighlightCluster?: (cluster: string | null) => void;
}) {
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  if (events.length === 0) return null;

  async function handleResolve(id: string) {
    setResolving((prev) => new Set(prev).add(id));
    await onResolve(id);
    setResolving((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  return (
    <div
      className="rounded-3xl p-5"
      style={{ background: 'rgba(10,14,30,0.97)', border: '1px solid rgba(99,102,241,0.20)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-4 h-4" style={{ color: '#818CF8' }} />
        <h2 className="text-base font-semibold" style={{ color: '#E8EDF5' }}>Action Feed</h2>
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ background: 'rgba(99,102,241,0.18)', color: '#818CF8' }}
        >
          {events.length} pending
        </span>
      </div>
      <div className="space-y-2">
        {events.map((event) => {
          const priority = PRIORITY_STYLES[event.priority] ?? PRIORITY_STYLES.normal;
          const isResolving = resolving.has(event.id);
          const isSubscriptionEvent = event.type === 'SUBSCRIPTION_DETECTED';
          const isAnomalyEvent      = ANOMALY_EVENT_TYPES.has(event.type);
          const isIncomeEvent       = INCOME_EVENT_TYPES.has(event.type);
          const isSavingsEvent      = SAVINGS_EVENT_TYPES.has(event.type);
          const resolveActions      = getResolveActions(event);

          return (
            <div
              key={event.id}
              className="rounded-2xl px-4 py-3 space-y-2"
              style={{
                background:
                  isSubscriptionEvent || isIncomeEvent ? 'rgba(74,222,128,0.05)'
                  : isSavingsEvent  ? 'rgba(253,211,77,0.05)'
                  : isAnomalyEvent  ? 'rgba(251,146,60,0.05)'
                  : 'rgba(255,255,255,0.06)',
                border:
                  isSubscriptionEvent || isIncomeEvent ? '1px solid rgba(74,222,128,0.15)'
                  : isSavingsEvent  ? '1px solid rgba(253,211,77,0.20)'
                  : isAnomalyEvent  ? '1px solid rgba(251,146,60,0.20)'
                  : '1px solid rgba(255,255,255,0.09)',
              }}
            >
              <div className="flex items-start gap-3">
                <span
                  className="mt-1.5 h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ background: priority.dot }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold" style={{ color: '#E8EDF5' }}>
                      {EVENT_TYPE_LABELS[event.type] ?? event.type}
                    </span>
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                      style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(232,237,245,0.50)' }}
                    >
                      {event.source}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(232,237,245,0.60)' }}>
                    {eventSummary(event)}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'rgba(232,237,245,0.35)' }}>
                    {new Date(event.createdAt).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

              {/* Subscription confirm/ignore row */}
              {isSubscriptionEvent && (
                <SubscriptionActions event={event} onDone={() => handleResolve(event.id)} />
              )}

              {/* Action row — contextual per event type */}
              {!isSubscriptionEvent && (
                <div className="flex items-center gap-2 flex-wrap">
                  {event.type === 'SUBSCRIPTION_OVERLAP' && (
                    <button
                      onClick={() => {
                        const cluster = (event.payload as Record<string, unknown>).clusterName as string | undefined;
                        onHighlightCluster?.(cluster ?? null);
                        setTimeout(() => {
                          document.getElementById('subscriptions-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 50);
                      }}
                      className="text-xs rounded-xl px-3 py-1.5 font-medium transition-opacity hover:opacity-80"
                      style={{
                        background: 'rgba(253,211,77,0.10)',
                        border: '1px solid rgba(253,211,77,0.25)',
                        color: '#FDE68A',
                        cursor: 'pointer',
                      }}
                    >
                      Review subscriptions ↓
                    </button>
                  )}
                  <button
                    onClick={() => handleResolve(event.id)}
                    disabled={isResolving}
                    className="flex items-center gap-1 text-xs rounded-xl px-3 py-1.5 font-medium transition-opacity hover:opacity-80 disabled:cursor-default"
                    style={{
                      background: isResolving ? 'rgba(255,255,255,0.04)' : resolveActions.primary.color,
                      color: isResolving ? 'rgba(232,237,245,0.30)' : resolveActions.primary.textColor,
                      border: isResolving ? '1px solid rgba(255,255,255,0.06)' : resolveActions.primary.border,
                    }}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {isResolving ? '…' : resolveActions.primary.label}
                  </button>
                  {resolveActions.secondary && !isResolving && (
                    <button
                      onClick={() => handleResolve(event.id)}
                      className="text-xs rounded-xl px-3 py-1.5 font-medium transition-opacity hover:opacity-80"
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        color: 'rgba(232,237,245,0.35)',
                        cursor: 'pointer',
                      }}
                    >
                      {resolveActions.secondary.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FinancePage() {
  const { data, mutate } = useSWR<V2FinanceOverviewFeed>('/api/v2/finance/overview', fetcher, {
    refreshInterval: 30000,
  });

  const [emeraldStatus, setEmeraldStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [showAllPayables, setShowAllPayables] = useState(false);
  const [exportedFlash, setExportedFlash] = useState(false);
  const [highlightCluster, setHighlightCluster] = useState<string | null>(null);

  const payables = data?.payables ?? [];
  const transactions = data?.transactions ?? [];
  const activePlans = (data?.plans ?? []).filter((p) => p.status === 'ACTIVE');
  const otherPlans = (data?.plans ?? []).filter((p) => p.status !== 'ACTIVE');
  const allPlans = [...activePlans, ...otherPlans];
  const liquidity = useMemo(
    () =>
      (data?.accounts ?? [])
        .filter((account) => account.type.toLowerCase() !== 'credit')
        .reduce((sum, account) => sum + account.balance, 0),
    [data]
  );

  const alerts = useMemo(() => {
    const list: { text: string; color: string; textColor: string }[] = [];
    const overduePayables = (data?.payables ?? []).filter((p) => p.status === 'overdue');
    if (overduePayables.length > 0) {
      list.push({
        text: `${overduePayables[0].vendor} payment requires manual approval`,
        color: 'var(--color-pink)',
        textColor: 'var(--color-pink-text)',
      });
    }
    const pendingPayables = (data?.payables ?? []).filter((p) => p.status === 'pending');
    if (pendingPayables.length > 0) {
      list.push({
        text: `${pendingPayables.length} invoice${pendingPayables.length > 1 ? 's' : ''} processed by Adrian need review`,
        color: 'var(--color-peach)',
        textColor: 'var(--color-peach-text)',
      });
    }
    const firstActive = (data?.plans ?? []).find((p) => p.status === 'ACTIVE');
    if (firstActive?.progressPercent != null) {
      list.push({
        text: `${firstActive.title}: ${firstActive.progressPercent}% toward target`,
        color: 'var(--color-mint)',
        textColor: 'var(--color-mint-text)',
      });
    }
    if (list.length === 0) {
      list.push({
        text: 'All systems nominal — no pending actions',
        color: 'var(--color-mint)',
        textColor: 'var(--color-mint-text)',
      });
    }
    return list;
  }, [data]);

  const monthlySummary = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const txs = (data?.transactions ?? []).filter((t) => {
      const d = new Date(t.date);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
    const income = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    return { income, expenses };
  }, [data]);

  const events = data?.events ?? [];
  const pendingMerchants = data?.merchants?.pendingCategorization ?? [];

  async function handleResolveEvent(id: string) {
    await fetch('/api/v2/finance/events', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    mutate();
  }

  function handleExport() {
    exportTransactionsCSV(transactions);
    setExportedFlash(true);
    setTimeout(() => setExportedFlash(false), 2000);
  }

  const vaultActions: QuickAction[] = [
    { label: 'Record Transaction', live: false },
    { label: 'Create Invoice', live: false },
    {
      label: 'Request Financial Analysis from Emerald',
      live: true,
      onClick: async () => {
        setEmeraldStatus('sending');
        try {
          const res = await fetch('/api/telegram/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: 'Emerald, please generate a financial analysis: liquidity, obligations, transaction trends, and 30-day forecast.',
              botKey: 'bot3',
            }),
          });
          setEmeraldStatus(res.ok ? 'sent' : 'error');
        } catch {
          setEmeraldStatus('error');
        }
        setTimeout(() => setEmeraldStatus('idle'), 3000);
      },
    },
    { label: 'Set Budget Alert', live: false },
    { label: 'Export Statement', live: true, onClick: handleExport },
  ];

  // ── Derived display helpers ────────────────────────────────────────────────
  const updatedAgo = useMemo(() => {
    if (!data?.generatedAt) return null;
    const diffMs = Date.now() - new Date(data.generatedAt).getTime();
    const secs = Math.floor(diffMs / 1000);
    if (secs < 10)  return 'just now';
    if (secs < 60)  return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    if (mins < 60)  return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs} hr ago`;
  }, [data?.generatedAt]);

  return (
    <div className="space-y-5">
      {/* Heading */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Finance</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Financial intelligence under Emerald&apos;s stewardship
          </p>
        </div>
        {updatedAgo && (
          <span className="text-[11px] pb-0.5" style={{ color: 'rgba(232,237,245,0.30)' }}>
            Updated {updatedAgo}
          </span>
        )}
      </div>

      {/* Partial system status banner */}
      {data?.systemStatus === 'partial' && (
        <div
          className="flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-xs"
          style={{
            background: 'rgba(251,146,60,0.06)',
            border: '1px solid rgba(251,146,60,0.18)',
            color: 'rgba(253,186,116,0.85)',
          }}
        >
          <AlertCircle size={12} style={{ flexShrink: 0, opacity: 0.8 }} />
          Some financial insights are temporarily unavailable. Core data is unaffected.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div className="space-y-5">

          {/* New Merchants — categorize once, auto-resolve forever */}
          <MerchantCategorizer merchants={pendingMerchants} onCategorized={mutate} />

          {/* Action Feed */}
          <ActionFeed
            events={events}
            onResolve={handleResolveEvent}
            onHighlightCluster={setHighlightCluster}
          />

          {/* Holdings */}
          <div
            className="rounded-3xl p-5"
            style={{ background: 'rgba(6,32,20,0.93)', border: '1px solid rgba(0,180,100,0.15)' }}
          >
            <div
              className="rounded-2xl p-4 mb-4"
              style={{ background: 'rgba(110,231,183,0.12)', border: '1px solid rgba(110,231,183,0.25)' }}
            >
              <p className="text-xs mb-1" style={{ color: 'rgba(232,237,245,0.65)' }}>Liquidity</p>
              <p className="text-2xl font-bold" style={{ color: '#6EE7B7' }}>
                ${liquidity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="flex items-center gap-2 mb-4">
              <RefreshCw className="w-4 h-4" style={{ color: 'rgba(232,237,245,0.6)' }} />
              <h2 className="text-base font-semibold" style={{ color: '#E8EDF5' }}>Holdings</h2>
            </div>
            {data?.accounts && data.accounts.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {data.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="rounded-2xl p-4"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
                  >
                    <p className="text-xs mb-1" style={{ color: 'rgba(232,237,245,0.55)' }}>{account.name}</p>
                    <p className="text-xl font-bold" style={{ color: '#E8EDF5' }}>
                      ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <TrendBadge trend={account.trendPercentage} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <Lock className="w-7 h-7" style={{ color: 'rgba(232,237,245,0.25)' }} />
                <p className="text-sm font-medium" style={{ color: '#E8EDF5', opacity: 0.6 }}>
                  No balance data on record
                </p>
                <p
                  className="text-xs text-center"
                  style={{ color: 'rgba(232,237,245,0.4)', maxWidth: 220 }}
                >
                  Live account balances have not been reported to The Vault yet.
                </p>
              </div>
            )}
          </div>

          {/* Obligations */}
          <div
            className="rounded-3xl p-5"
            style={{ background: 'rgba(26,10,26,0.93)', border: '1px solid rgba(180,60,160,0.15)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" style={{ color: 'rgba(232,237,245,0.6)' }} />
                <h2 className="text-base font-semibold" style={{ color: '#E8EDF5' }}>Obligations</h2>
              </div>
              {payables.length > 3 && (
                <button
                  onClick={() => setShowAllPayables(!showAllPayables)}
                  className="flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    color: 'rgba(232,237,245,0.7)',
                    border: '1px solid rgba(255,255,255,0.12)',
                  }}
                >
                  {showAllPayables ? 'Show Less' : 'View All'}
                  <ChevronDown
                    className="w-3 h-3"
                    style={{
                      transform: showAllPayables ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s ease',
                    }}
                  />
                </button>
              )}
            </div>
            <div className="space-y-2">
              {payables.length === 0 && (
                <p className="text-sm" style={{ color: 'rgba(232,237,245,0.5)' }}>No obligations on record.</p>
              )}
              {(showAllPayables ? payables : payables.slice(0, 3)).map((payable, idx) => (
                <div
                  key={`${payable.vendor}-${idx}`}
                  className="flex items-center justify-between rounded-2xl px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: '#E8EDF5' }}>{payable.vendor}</span>
                      {payable.status === 'pending' && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: 'rgba(139,116,214,0.20)', color: '#C4B5FD' }}
                        >
                          Auto-pay
                        </span>
                      )}
                      {payable.status === 'overdue' && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: 'rgba(248,113,113,0.15)', color: '#F87171' }}
                        >
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(232,237,245,0.50)' }}>
                      Due {payable.dueDate}
                    </p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: '#E8EDF5' }}>
                    ${payable.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Transactions */}
          <div
            className="rounded-3xl p-5"
            style={{ background: 'rgba(6,12,32,0.93)', border: '1px solid rgba(60,100,220,0.15)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Download className="w-4 h-4" style={{ color: 'rgba(232,237,245,0.6)' }} />
                <h2 className="text-base font-semibold" style={{ color: '#E8EDF5' }}>Transactions</h2>
              </div>
              <button
                onClick={handleExport}
                className="text-xs font-medium rounded-full px-3 py-1"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(232,237,245,0.7)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                {exportedFlash ? 'Exported ✓' : 'Export'}
              </button>
            </div>
            <div className="space-y-2">
              {transactions.length === 0 && (
                <p className="text-sm" style={{ color: 'rgba(232,237,245,0.5)' }}>No recent activity recorded.</p>
              )}
              {transactions.map((tx, idx) => (
                <div
                  key={`${tx.description}-${idx}`}
                  className="flex items-center justify-between rounded-2xl px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#E8EDF5' }}>{tx.description}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(232,237,245,0.50)' }}>
                      {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ·{' '}
                      {tx.category} · {tx.handledByBot}
                    </p>
                  </div>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: tx.amount < 0 ? '#F87171' : '#6EE7B7' }}
                  >
                    {tx.amount < 0 ? '-' : '+'}${Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Income Sources */}
          {(data?.incomeSources ?? []).length > 0 && (
            <IncomeSourcesCard sources={data!.incomeSources} onMutate={mutate} />
          )}

          {/* Cash Flow Forecast */}
          {data?.forecast && data.forecast.days.length > 0 && (
            <CashFlowForecastCard forecast={data.forecast} />
          )}

          {/* Budget Overview */}
          {(data?.budget ?? []).length > 0 && (
            <div
              className="rounded-3xl p-5"
              style={{ background: 'rgba(6,18,30,0.93)', border: '1px solid rgba(56,189,248,0.15)' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-base font-semibold" style={{ color: '#E8EDF5' }}>Budget Overview</h2>
                <span className="text-xs ml-1" style={{ color: 'rgba(232,237,245,0.45)' }}>
                  {new Date().toLocaleDateString('en-US', { month: 'long' })}
                </span>
              </div>
              <div className="space-y-3">
                {(data?.budget ?? [])
                  .filter((row) => row.spent > 0 || row.monthlyTarget > 0)
                  .map((row) => {
                    const barColor =
                      row.status === 'green'  ? '#6EE7B7' :
                      row.status === 'yellow' ? '#FDE68A' : '#F87171';
                    const remainingColor =
                      row.status === 'green'  ? '#6EE7B7' :
                      row.status === 'yellow' ? '#FCD34D' : '#F87171';

                    return (
                      <div key={row.id}>
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            {row.emoji && <span className="text-sm">{row.emoji}</span>}
                            <span className="text-sm font-medium capitalize" style={{ color: '#E8EDF5' }}>
                              {row.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            <span style={{ color: 'rgba(232,237,245,0.50)' }}>
                              ${row.spent.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                              {' / '}
                              ${row.monthlyTarget.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                            </span>
                            <span className="font-semibold w-10 text-right" style={{ color: remainingColor }}>
                              {row.remaining >= 0
                                ? `$${row.remaining.toLocaleString('en-US', { minimumFractionDigits: 0 })}`
                                : `-$${Math.abs(row.remaining).toLocaleString('en-US', { minimumFractionDigits: 0 })}`}
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, row.percentUsed)}%`,
                              background: barColor,
                              boxShadow: row.status === 'red' ? `0 0 6px ${barColor}60` : undefined,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Subscriptions */}
          <div id="subscriptions-card">
            <SubscriptionsCard
              subscriptions={data?.subscriptions ?? []}
              highlightCluster={highlightCluster}
            />
          </div>

          {/* Financial Plans */}
          {allPlans.length > 0 && (
            <div
              className="rounded-3xl p-5"
              style={{ background: 'rgba(16,14,28,0.93)', border: '1px solid rgba(123,104,238,0.15)' }}
            >
              <h2 className="text-base font-semibold mb-4" style={{ color: '#E8EDF5' }}>Financial Plans</h2>
              <div className="space-y-3">
                {allPlans.map((plan) => (
                  <PlanProgressCard key={plan.id} plan={plan} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">

          {/* Finance Health Score */}
          {data?.healthScore && (
            <FinanceHealthCard health={data.healthScore} />
          )}

          {/* Net Worth */}
          {(data?.netWorthHistory ?? []).length > 0 && (
            <NetWorthCard history={data!.netWorthHistory} />
          )}

          {/* Alerts */}
          <div
            className="rounded-3xl p-5"
            style={{ background: 'rgba(12,9,22,0.95)', border: '1px solid rgba(123,104,238,0.12)' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4" style={{ color: 'rgba(232,237,245,0.5)' }} />
              <h2 className="text-sm font-semibold" style={{ color: '#E8EDF5' }}>Alerts</h2>
            </div>
            <div className="space-y-2">
              {alerts.map((alert, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl px-4 py-3 text-sm"
                  style={{ background: alert.color, color: alert.textColor }}
                >
                  {alert.text}
                </div>
              ))}
            </div>
          </div>

          {/* Vault Actions */}
          <div
            className="rounded-3xl p-5"
            style={{ background: 'rgba(12,9,22,0.95)', border: '1px solid rgba(123,104,238,0.12)' }}
          >
            <h2 className="text-sm font-semibold mb-3" style={{ color: '#E8EDF5' }}>Vault Actions</h2>
            <div className="space-y-2">
              {vaultActions.map((action) =>
                action.live ? (
                  <button
                    key={action.label}
                    onClick={action.onClick}
                    className="w-full text-left rounded-2xl px-4 py-2.5 text-sm"
                    style={{
                      background:
                        action.label === 'Request Financial Analysis from Emerald'
                          ? 'rgba(16,185,129,0.18)'
                          : 'rgba(255,255,255,0.10)',
                      color: '#E8EDF5',
                      border:
                        action.label === 'Request Financial Analysis from Emerald'
                          ? '1px solid rgba(16,185,129,0.45)'
                          : '1px solid rgba(255,255,255,0.18)',
                      cursor: 'pointer',
                    }}
                  >
                    <span className="flex items-center gap-2">
                      {action.label === 'Request Financial Analysis from Emerald' ? (
                        <>
                          <Send className="w-3 h-3 flex-shrink-0" style={{ opacity: 0.7 }} />
                          {emeraldStatus === 'sending'
                            ? 'Dispatching…'
                            : emeraldStatus === 'sent'
                              ? 'Analysis requested ✓'
                              : emeraldStatus === 'error'
                                ? 'Error — try again'
                                : action.label}
                        </>
                      ) : (
                        <>
                          <Download className="w-3 h-3 flex-shrink-0" style={{ opacity: 0.7 }} />
                          {exportedFlash ? 'Exported ✓' : action.label}
                        </>
                      )}
                    </span>
                  </button>
                ) : (
                  <button
                    key={action.label}
                    disabled
                    className="w-full text-left rounded-2xl px-4 py-2.5 text-sm"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      color: 'rgba(232,237,245,0.30)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      cursor: 'default',
                    }}
                  >
                    <span className="flex items-center justify-between">
                      {action.label}
                      <span
                        className="text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                        style={{
                          background: 'rgba(255,255,255,0.06)',
                          color: 'rgba(232,237,245,0.35)',
                        }}
                      >
                        Standby
                      </span>
                    </span>
                  </button>
                )
              )}
            </div>
          </div>

          {/* Monthly Summary */}
          <div
            className="rounded-3xl p-5"
            style={{ background: 'rgba(12,9,22,0.95)', border: '1px solid rgba(123,104,238,0.12)' }}
          >
            <h2 className="text-sm font-semibold mb-3" style={{ color: '#E8EDF5' }}>
              {new Date().toLocaleDateString('en-US', { month: 'long' })} Summary
            </h2>
            {!data ? (
              <p className="text-sm text-center py-4" style={{ color: 'rgba(232,237,245,0.45)' }}>
                No monthly activity available.
              </p>
            ) : (
              <div className="space-y-2">
                {[
                  { label: 'Income', value: monthlySummary.income, positive: true },
                  { label: 'Expenses', value: monthlySummary.expenses, positive: false },
                  {
                    label: 'Net',
                    value: monthlySummary.income - monthlySummary.expenses,
                    positive: monthlySummary.income >= monthlySummary.expenses,
                  },
                ].map(({ label, value, positive }) => (
                  <div key={label} className="flex items-center justify-between text-sm">
                    <span style={{ color: 'rgba(232,237,245,0.65)' }}>{label}</span>
                    <span className="font-semibold" style={{ color: positive ? '#6EE7B7' : '#F87171' }}>
                      ${value.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
