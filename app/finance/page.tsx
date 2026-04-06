'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { RefreshCw, AlertCircle, CreditCard, Upload } from 'lucide-react';
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

function TrendBadge({ trend }: { trend: string }) {
  const isPositive = trend.startsWith('+');
  const isNegative = trend.startsWith('-');
  return (
    <span
      className="text-xs font-semibold"
      style={{ color: isPositive ? '#0A6B5A' : isNegative ? '#E53E3E' : 'var(--muted-foreground)' }}
    >
      {isPositive ? '↗' : isNegative ? '↘' : '→'} {trend}
    </span>
  );
}

function PlanProgressCard({ plan }: { plan: V2FinancePlan }) {
  const completedMilestones = plan.milestones.filter((m) => m.completedAt).length;
  const targetDate = plan.targetDate
    ? new Date(plan.targetDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : null;

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ background: 'var(--input-background)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{plan.title}</p>
          {plan.goal && <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{plan.goal}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              background: plan.status === 'ACTIVE' ? 'var(--color-mint)' : 'var(--muted)',
              color: plan.status === 'ACTIVE' ? 'var(--color-mint-text)' : 'var(--muted-foreground)',
            }}
          >
            {plan.status.charAt(0) + plan.status.slice(1).toLowerCase()}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px]"
            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
          >
            {PLAN_TYPE_LABELS[plan.type] ?? plan.type}
          </span>
        </div>
      </div>

      {plan.currentValue != null && plan.targetValue != null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted-foreground)' }}>
            <span>
              {plan.currentValue.toLocaleString()}{plan.unit ? ` ${plan.unit}` : ''} of {plan.targetValue.toLocaleString()}{plan.unit ? ` ${plan.unit}` : ''}
            </span>
            {plan.progressPercent != null && (
              <span style={{ color: 'var(--color-cyan)', fontWeight: 600 }}>{plan.progressPercent}%</span>
            )}
          </div>
          <div className="h-1.5 rounded-full" style={{ background: 'rgba(100,130,200,0.15)' }}>
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500"
              style={{ width: `${plan.progressPercent ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {plan.milestones.length > 0 && (
        <div className="space-y-1">
          {plan.milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div
                className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                style={{ background: m.completedAt ? 'var(--color-cyan)' : 'var(--border)' }}
              />
              <span style={{ color: m.completedAt ? 'var(--muted-foreground)' : 'var(--foreground)', textDecoration: m.completedAt ? 'line-through' : 'none' }}>
                {m.label}
              </span>
              {m.targetValue != null && (
                <span className="ml-auto" style={{ color: 'var(--muted-foreground)' }}>
                  {m.targetValue.toLocaleString()}{plan.unit ? ` ${plan.unit}` : ''}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
        <span>Managed by {plan.managedByBot}</span>
        {targetDate && <span>Target: {targetDate}</span>}
      </div>
    </div>
  );
}

export default function FinancePage() {
  const { data, mutate, isLoading } = useSWR<V2FinanceOverviewFeed>('/api/v2/finance/overview', fetcher, { refreshInterval: 30000 });

  const activePlans = (data?.plans ?? []).filter((p) => p.status === 'ACTIVE');
  const otherPlans = (data?.plans ?? []).filter((p) => p.status !== 'ACTIVE');
  const allPlans = [...activePlans, ...otherPlans];

  // Derive alerts from data
  const alerts = useMemo(() => {
    const list: { text: string; color: string; textColor: string }[] = [];
    const overdue = (data?.payables ?? []).filter((p) => p.status === 'overdue');
    if (overdue.length > 0) {
      list.push({ text: `${overdue[0].vendor} payment requires manual approval`, color: 'var(--color-pink)', textColor: 'var(--color-pink-text)' });
    }
    const pending = (data?.payables ?? []).filter((p) => p.status === 'pending');
    if (pending.length > 0) {
      list.push({ text: `${pending.length} invoice${pending.length > 1 ? 's' : ''} processed by Adrian need review`, color: 'var(--color-peach)', textColor: 'var(--color-peach-text)' });
    }
    if (activePlans.length > 0) {
      const plan = activePlans[0];
      if (plan.progressPercent != null) {
        list.push({ text: `${plan.title}: ${plan.progressPercent}% toward target`, color: 'var(--color-mint)', textColor: 'var(--color-mint-text)' });
      }
    }
    if (list.length === 0) {
      list.push({ text: 'All systems nominal — no pending actions', color: 'var(--color-mint)', textColor: 'var(--color-mint-text)' });
    }
    return list;
  }, [data, activePlans]);

  // April summary from transactions
  const aprilSummary = useMemo(() => {
    const txs = data?.transactions ?? [];
    const income = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expenses = txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
    const total = data?.accounts.reduce((s, a) => s + a.balance, 0) ?? 0;
    return { income: income || 8500, expenses: expenses || 4200, total: total || 0 };
  }, [data]);

  const quickActions = [
    'Record Transaction',
    'Create Invoice',
    'Request Report from Adrian',
    'Set Budget Alert',
    'Export Statement',
  ];

  return (
    <div className="space-y-5">
      {/* Heading */}
      <div>
        <h1 className="text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Finance</h1>
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Money operations &amp; controls</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        {/* Left column */}
        <div className="space-y-5">

          {/* Account Balances — mint pastel */}
          <div className="rounded-3xl p-5" style={{ background: 'var(--color-mint)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="flex items-center gap-2 mb-4">
              <RefreshCw className="w-4 h-4" style={{ color: 'var(--color-mint-text)' }} />
              <h2 className="text-base font-semibold" style={{ color: 'var(--color-mint-text)' }}>Account Balances</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {(data?.accounts ?? [
                { type: 'Operating Account', balance: 47823.42, trendPercentage: '+2.3%' },
                { type: 'Savings', balance: 125000, trendPercentage: '+0.8%' },
                { type: 'Credit Card', balance: 3241.17, trendPercentage: '-1.2%' },
              ]).map((account) => (
                <div
                  key={account.type}
                  className="rounded-2xl p-4"
                  style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.8)' }}
                >
                  <p className="text-xs mb-1" style={{ color: 'var(--color-mint-text)', opacity: 0.75 }}>{account.type}</p>
                  <p className="text-xl font-bold" style={{ color: '#0F1B35' }}>
                    ${account.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <TrendBadge trend={account.trendPercentage} />
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Bills — peach pastel */}
          <div className="rounded-3xl p-5" style={{ background: 'var(--color-peach)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" style={{ color: 'var(--color-peach-text)' }} />
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-peach-text)' }}>Upcoming Bills &amp; Payments</h2>
              </div>
              <button
                className="text-xs font-medium rounded-full px-3 py-1"
                style={{ background: 'rgba(255,255,255,0.6)', color: 'var(--color-peach-text)', border: '1px solid rgba(255,255,255,0.8)' }}
              >
                View All
              </button>
            </div>
            <div className="space-y-2">
              {(data?.payables ?? []).length === 0 && (
                <p className="text-sm" style={{ color: 'var(--color-peach-text)', opacity: 0.7 }}>No upcoming bills.</p>
              )}
              {(data?.payables ?? []).map((payable, idx) => (
                <div
                  key={`${payable.vendor}-${idx}`}
                  className="flex items-center justify-between rounded-2xl px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)' }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: '#0F1B35' }}>{payable.vendor}</span>
                      {payable.status === 'pending' && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: 'rgba(139,116,214,0.15)', color: '#4A3DAA' }}
                        >
                          Auto-pay
                        </span>
                      )}
                      {payable.status === 'overdue' && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: 'rgba(229,62,62,0.12)', color: '#E53E3E' }}
                        >
                          Overdue
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-peach-text)', opacity: 0.75 }}>Due {payable.dueDate}</p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: '#0F1B35' }}>
                    ${payable.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Transactions — sky pastel */}
          <div className="rounded-3xl p-5" style={{ background: 'var(--color-sky)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Upload className="w-4 h-4" style={{ color: 'var(--color-sky-text)' }} />
                <h2 className="text-base font-semibold" style={{ color: 'var(--color-sky-text)' }}>Recent Transactions</h2>
              </div>
              <button
                className="text-xs font-medium rounded-full px-3 py-1"
                style={{ background: 'rgba(255,255,255,0.6)', color: 'var(--color-sky-text)', border: '1px solid rgba(255,255,255,0.8)' }}
              >
                Export
              </button>
            </div>
            <div className="space-y-2">
              {(data?.transactions ?? []).length === 0 && (
                <p className="text-sm" style={{ color: 'var(--color-sky-text)', opacity: 0.7 }}>No recent transactions.</p>
              )}
              {(data?.transactions ?? []).map((tx, idx) => (
                <div
                  key={`${tx.description}-${idx}`}
                  className="flex items-center justify-between rounded-2xl px-4 py-3"
                  style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)' }}
                >
                  <div>
                    <p className="text-sm font-medium" style={{ color: '#0F1B35' }}>{tx.description}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-sky-text)', opacity: 0.75 }}>
                      {new Date(tx.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {tx.category} · {tx.handledByBot}
                    </p>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: tx.amount < 0 ? '#E53E3E' : '#0A6B5A' }}>
                    {tx.amount < 0 ? '-' : '+'}${Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Finance Plans */}
          {allPlans.length > 0 && (
            <div
              className="rounded-3xl p-5"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--foreground)' }}>Financial Plans</h2>
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

          {/* Alerts & Priorities */}
          <div className="rounded-3xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
              <h2 className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>Alerts &amp; Priorities</h2>
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

          {/* Quick Actions — lavender */}
          <div className="rounded-3xl p-5" style={{ background: 'var(--color-lavender)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-lavender-text)' }}>Quick Actions</h2>
            <div className="space-y-2">
              {quickActions.map((action) => (
                <button
                  key={action}
                  className="w-full text-left rounded-2xl px-4 py-2.5 text-sm transition-opacity hover:opacity-80"
                  style={{ background: 'rgba(255,255,255,0.55)', color: '#0F1B35', border: '1px solid rgba(255,255,255,0.8)' }}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>

          {/* April Summary — pink */}
          <div className="rounded-3xl p-5" style={{ background: 'var(--color-pink)', border: '1px solid rgba(0,0,0,0.06)' }}>
            <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-pink-text)' }}>
              {new Date().toLocaleDateString('en-US', { month: 'long' })} Summary
            </h2>
            <div className="space-y-2">
              {[
                { label: 'Income', value: aprilSummary.income, positive: true },
                { label: 'Expenses', value: aprilSummary.expenses, positive: false },
                { label: 'Net', value: aprilSummary.income - aprilSummary.expenses, positive: aprilSummary.income >= aprilSummary.expenses },
              ].map(({ label, value, positive }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span style={{ color: 'var(--color-pink-text)', opacity: 0.8 }}>{label}</span>
                  <span className="font-semibold" style={{ color: positive ? 'var(--color-mint-text)' : '#E53E3E' }}>
                    ${value.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
