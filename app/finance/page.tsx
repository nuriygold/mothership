'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { RefreshCw, AlertCircle, CreditCard, Lock, Send, Download, ChevronDown } from 'lucide-react';
import type { V2FinanceOverviewFeed, V2FinancePlan } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

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

export default function FinancePage() {
  const { data } = useSWR<V2FinanceOverviewFeed>('/api/v2/finance/overview', fetcher, {
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
    const txs = data?.transactions ?? [];
    const income = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    return { income, expenses };
  }, [data]);

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
              botKey: 'bot1',
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
