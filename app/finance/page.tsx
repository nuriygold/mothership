'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { RefreshCw, AlertCircle, CreditCard, Lock, Send, Download, ChevronDown, Zap, CheckCircle2, Tag } from 'lucide-react';
import type { V2FinanceOverviewFeed, V2FinancePlan, V2FinanceEvent } from '@/lib/v2/types';

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
  ALERT: 'Alert',
};

const PRIORITY_STYLES: Record<string, { dot: string; label: string }> = {
  critical: { dot: '#F87171', label: 'Critical' },
  high:     { dot: '#FB923C', label: 'High' },
  normal:   { dot: '#C4B5FD', label: 'Normal' },
  low:      { dot: 'rgba(232,237,245,0.35)', label: 'Low' },
};

// Anomaly event types get a warning tint in the feed
const ANOMALY_EVENT_TYPES = new Set([
  'UNUSUAL_CHARGE',
  'SUBSCRIPTION_PRICE_CHANGE',
  'CATEGORY_SPIKE',
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
    default:
      return event.type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
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
}: {
  events: V2FinanceEvent[];
  onResolve: (id: string) => Promise<void>;
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

          return (
            <div
              key={event.id}
              className="rounded-2xl px-4 py-3 space-y-2"
              style={{
                background: isSubscriptionEvent ? 'rgba(74,222,128,0.05)'
                  : isAnomalyEvent              ? 'rgba(251,146,60,0.05)'
                  : 'rgba(255,255,255,0.06)',
                border: isSubscriptionEvent ? '1px solid rgba(74,222,128,0.15)'
                  : isAnomalyEvent           ? '1px solid rgba(251,146,60,0.20)'
                  : '1px solid rgba(255,255,255,0.09)',
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
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

                {/* Standard resolve — not used for subscriptions */}
                {!isSubscriptionEvent && (
                  <button
                    onClick={() => handleResolve(event.id)}
                    disabled={isResolving}
                    className="flex-shrink-0 flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[10px] font-semibold"
                    style={{
                      background: isResolving ? 'rgba(255,255,255,0.04)' : 'rgba(99,102,241,0.15)',
                      color: isResolving ? 'rgba(232,237,245,0.30)' : '#818CF8',
                      border: '1px solid rgba(99,102,241,0.25)',
                      cursor: isResolving ? 'default' : 'pointer',
                    }}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {isResolving ? '…' : 'Resolve'}
                  </button>
                )}
              </div>

              {/* Subscription confirm/ignore row */}
              {isSubscriptionEvent && (
                <SubscriptionActions event={event} onDone={() => handleResolve(event.id)} />
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

  return (
    <div className="space-y-5">
      {/* Heading */}
      <div>
        <h1 className="text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Finance</h1>
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          Financial intelligence under Emerald&apos;s stewardship
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div className="space-y-5">

          {/* New Merchants — categorize once, auto-resolve forever */}
          <MerchantCategorizer merchants={pendingMerchants} onCategorized={mutate} />

          {/* Action Feed */}
          <ActionFeed events={events} onResolve={handleResolveEvent} />

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
