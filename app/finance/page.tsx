'use client';

import useSWR from 'swr';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
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

const PLAN_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  PAUSED: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-sky-100 text-sky-700',
  ARCHIVED: 'bg-slate-100 text-slate-500',
};

function PlanCard({ plan }: { plan: V2FinancePlan }) {
  const completedMilestones = plan.milestones.filter((m) => m.completedAt).length;
  const targetDate = plan.targetDate ? new Date(plan.targetDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null;

  return (
    <div className="rounded-xl border border-border bg-[var(--input-background)] p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{plan.title}</p>
          {plan.goal && <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{plan.goal}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${PLAN_STATUS_COLORS[plan.status] ?? 'bg-slate-100 text-slate-600'}`}>
            {plan.status.charAt(0) + plan.status.slice(1).toLowerCase()}
          </span>
          <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]">
            {PLAN_TYPE_LABELS[plan.type] ?? plan.type}
          </span>
        </div>
      </div>

      {plan.currentValue != null && plan.targetValue != null && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
            <span>
              {plan.currentValue.toLocaleString()}{plan.unit ? ` ${plan.unit}` : ''} of {plan.targetValue.toLocaleString()}{plan.unit ? ` ${plan.unit}` : ''}
            </span>
            {plan.progressPercent != null && <span>{plan.progressPercent}%</span>}
          </div>
          <div className="h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 transition-all"
              style={{ width: `${plan.progressPercent ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {plan.milestones.length > 0 && (
        <div className="space-y-1">
          {plan.milestones.map((m, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${m.completedAt ? 'bg-emerald-400' : 'bg-slate-300'}`} />
              <span className={m.completedAt ? 'text-[var(--muted-foreground)] line-through' : 'text-[var(--foreground)]'}>{m.label}</span>
              {m.targetValue != null && (
                <span className="ml-auto text-[var(--muted-foreground)]">{m.targetValue.toLocaleString()}{plan.unit ? ` ${plan.unit}` : ''}</span>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
        <span>Managed by {plan.managedByBot}</span>
        {targetDate && <span>Target: {targetDate}</span>}
      </div>
    </div>
  );
}

export default function FinancePage() {
  const { data } = useSWR<V2FinanceOverviewFeed>('/api/v2/finance/overview', fetcher, { refreshInterval: 30000 });

  const activePlans = (data?.plans ?? []).filter((p) => p.status === 'ACTIVE');
  const otherPlans = (data?.plans ?? []).filter((p) => p.status !== 'ACTIVE');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Finance</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Adapter-first financial operations feed routed to Adrian.</p>
      </div>

      {(data?.plans ?? []).length > 0 && (
        <Card>
          <CardTitle>Active Plans</CardTitle>
          <CardSubtitle>
            {activePlans.length} active · {otherPlans.length} other ·{' '}
            <span className="text-[11px]">
              add plans to <code className="rounded bg-[var(--muted)] px-1 py-0.5 text-[11px]">plans/finance/</code> and run{' '}
              <code className="rounded bg-[var(--muted)] px-1 py-0.5 text-[11px]">npm run finance:ingest</code>
            </span>
          </CardSubtitle>
          <div className="mt-3 space-y-3">
            {activePlans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
            {otherPlans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>Account Balances</CardTitle>
          <CardSubtitle>Connected accounts</CardSubtitle>
          <div className="mt-3 space-y-2">
            {(data?.accounts ?? []).map((account) => (
              <div key={account.type} className="rounded-lg border border-border bg-[var(--input-background)] p-3">
                <p className="text-sm font-medium text-[var(--foreground)]">{account.type}</p>
                <p className="text-xs text-[var(--muted-foreground)]">${account.balance.toLocaleString()} · {account.trendPercentage}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardTitle>Upcoming Bills / Payables</CardTitle>
          <CardSubtitle>Flagged by finance adapter</CardSubtitle>
          <div className="mt-3 space-y-2">
            {(data?.payables ?? []).map((payable, index) => (
              <div key={`${payable.vendor}-${index}`} className="rounded-lg border border-border bg-[var(--input-background)] p-3">
                <p className="text-sm font-medium text-[var(--foreground)]">{payable.vendor}</p>
                <p className="text-xs text-[var(--muted-foreground)]">${payable.amount.toLocaleString()} · due {payable.dueDate} · {payable.status}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardTitle>Recent Transactions</CardTitle>
        <div className="mt-3 space-y-2">
          {(data?.transactions ?? []).map((tx, index) => (
            <div key={`${tx.description}-${index}`} className="rounded-lg border border-border bg-[var(--input-background)] p-3">
              <p className="text-sm font-medium text-[var(--foreground)]">{tx.description}</p>
              <p className="text-xs text-[var(--muted-foreground)]">{new Date(tx.date).toLocaleDateString()} · {tx.category} · ${tx.amount.toLocaleString()} · handled by {tx.handledByBot}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
