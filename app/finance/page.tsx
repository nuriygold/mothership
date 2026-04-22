'use client';

import useSWR from 'swr';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import type { V2FinanceOverviewFeed } from '@/lib/v2/types';

const fetcher = async (url: string): Promise<V2FinanceOverviewFeed> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Finance overview fetch failed: ${response.status}`);
  }
  return response.json();
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function toMonthKey(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return monthKey(parsed);
}

function MetricCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <Card>
      <CardSubtitle>{title}</CardSubtitle>
      <p className="mt-2 text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
        {value}
      </p>
      {subtitle ? (
        <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>
          {subtitle}
        </p>
      ) : null}
    </Card>
  );
}

export default function FinancePage() {
  const { data, error, isLoading } = useSWR('/api/v2/finance/overview', fetcher, {
    refreshInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardTitle>Finance Dashboard</CardTitle>
          <div className="mt-1"><CardSubtitle>Loading finance data...</CardSubtitle></div>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Card>
          <CardTitle>Finance Dashboard</CardTitle>
          <div className="mt-1"><CardSubtitle>Unable to load finance data right now.</CardSubtitle></div>
        </Card>
      </div>
    );
  }

  const now = new Date();
  const currentMonth = monthKey(now);

  const netWorth =
    data.netWorthHistory.length > 0
      ? data.netWorthHistory[data.netWorthHistory.length - 1].netWorth
      : data.accounts.reduce((sum, account) => sum + account.balance, 0);

  const cashBalance = data.accounts
    .filter((account) => {
      const type = account.type.toLowerCase();
      return type.includes('depository') || type.includes('cash') || type.includes('checking') || type.includes('savings');
    })
    .reduce((sum, account) => sum + account.balance, 0);

  const monthTransactions = data.transactions.filter((tx) => toMonthKey(tx.date) === currentMonth);

  const monthlySpend = monthTransactions
    .filter((tx) => tx.amount < 0)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  const monthlyIncome = monthTransactions
    .filter((tx) => tx.amount > 0)
    .reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Net Worth" value={formatCurrency(netWorth)} subtitle="Latest snapshot" />
        <MetricCard title="Cash Balance" value={formatCurrency(cashBalance)} subtitle="Liquid accounts" />
        <MetricCard title="Monthly Spend" value={formatCurrency(monthlySpend)} subtitle="Current month outflow" />
        <MetricCard title="Monthly Income" value={formatCurrency(monthlyIncome)} subtitle="Current month inflow" />
      </div>

      <Card>
        <CardTitle>Financial Campaigns</CardTitle>
        <div className="mt-1"><CardSubtitle>Working buckets for planned allocations and obligations.</CardSubtitle></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            { name: 'Tax Reserve', detail: 'Quarterly tax set-aside and filing prep.' },
            { name: 'Infrastructure Budget', detail: 'Hosting, tools, and operational software.' },
            { name: 'Vendor Payments', detail: 'Active payables and contractor disbursements.' },
          ].map((campaign) => (
            <div key={campaign.name} className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{campaign.name}</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted-foreground)' }}>{campaign.detail}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardTitle>Accounts</CardTitle>
          <div className="mt-1"><CardSubtitle>Connected account balances from finance sources.</CardSubtitle></div>
          <div className="mt-3 divide-y divide-border/80">
            {data.accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm" style={{ color: 'var(--foreground)' }}>{account.name}</p>
                  <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                    {account.type}
                  </p>
                </div>
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                  {formatCurrency(account.balance)}
                </p>
              </div>
            ))}
            {data.accounts.length === 0 ? (
              <p className="py-6 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                No accounts available yet.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardTitle>Transactions</CardTitle>
          <div className="mt-1"><CardSubtitle>Recent transaction activity from connected accounts.</CardSubtitle></div>
          <div className="mt-3 divide-y divide-border/80">
            {data.transactions.slice(0, 15).map((tx, index) => (
              <div key={`${tx.date}-${tx.description}-${index}`} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm" style={{ color: 'var(--foreground)' }}>{tx.description}</p>
                  <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                    {tx.date || 'Unknown date'} • {tx.category}
                  </p>
                </div>
                <p
                  className="shrink-0 text-sm font-semibold"
                  style={{ color: tx.amount < 0 ? '#fca5a5' : '#86efac' }}
                >
                  {tx.amount < 0 ? '-' : '+'}
                  {formatCurrency(Math.abs(tx.amount))}
                </p>
              </div>
            ))}
            {data.transactions.length === 0 ? (
              <p className="py-6 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                No transactions available yet.
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
