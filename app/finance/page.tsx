'use client';

import useSWR from 'swr';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import type { V2FinanceOverviewFeed } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function FinancePage() {
  const { data } = useSWR<V2FinanceOverviewFeed>('/api/v2/finance/overview', fetcher, { refreshInterval: 30000 });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Finance</h1>
        <p className="text-sm text-slate-500">Adapter-first financial operations feed routed to Adrian.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>Account Balances</CardTitle>
          <CardSubtitle>Connected accounts</CardSubtitle>
          <div className="mt-3 space-y-2">
            {(data?.accounts ?? []).map((account) => (
              <div key={account.type} className="rounded-lg border border-border bg-[var(--input-background)] p-3">
                <p className="text-sm font-medium text-slate-900">{account.type}</p>
                <p className="text-xs text-slate-500">${account.balance.toLocaleString()} • {account.trendPercentage}</p>
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
                <p className="text-sm font-medium text-slate-900">{payable.vendor}</p>
                <p className="text-xs text-slate-500">${payable.amount.toLocaleString()} • due {payable.dueDate} • {payable.status}</p>
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
              <p className="text-sm font-medium text-slate-900">{tx.description}</p>
              <p className="text-xs text-slate-500">{new Date(tx.date).toLocaleDateString()} • {tx.category} • ${tx.amount.toLocaleString()} • handled by {tx.handledByBot}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

