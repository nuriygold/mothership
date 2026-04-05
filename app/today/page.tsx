'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import { KissinBooth } from '@/components/today/kissin-booth';
import type { V2TodayFeed } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function TodayPage() {
  const { data, mutate } = useSWR<V2TodayFeed>('/api/v2/dashboard/today', fetcher, { refreshInterval: 30000 });
  const [streamStatus, setStreamStatus] = useState<'live' | 'fallback'>('fallback');

  useEffect(() => {
    const stream = new EventSource('/api/v2/stream/dashboard');
    stream.addEventListener('connected', () => setStreamStatus('live'));
    stream.addEventListener('approval.updated', () => {
      void mutate();
    });
    stream.onerror = () => setStreamStatus('fallback');
    return () => stream.close();
  }, [mutate]);

  const feed = data;
  const priorities = feed?.topPriorities ?? [];
  const health = feed?.systemHealth;
  const timeline = feed?.timeline ?? [];

  const greeting = useMemo(() => {
    if (!feed) return 'Loading...';
    return `${feed.userContext.greeting}, ${feed.userContext.userName}`;
  }, [feed]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">{greeting}</h1>
          <p className="text-sm text-slate-500">You move with intention and grace.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs ${streamStatus === 'live' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {streamStatus === 'live' ? 'System stream live' : 'Polling fallback'}
        </span>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardTitle>Today&apos;s Timeline</CardTitle>
            <div className="mt-3 space-y-2">
              {timeline.map((entry, idx) => (
                <div key={`${entry.time}-${idx}`} className="flex items-center justify-between rounded-xl border border-border bg-[var(--input-background)] p-3">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-semibold text-cyan-600">{entry.time}</span>
                    <span className="text-sm text-slate-800">{entry.title}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Top Priorities</CardTitle>
            <CardSubtitle>High-signal tasks ready for one-click approval</CardSubtitle>
            <div className="mt-3 space-y-2">
              {priorities.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-border bg-[var(--input-background)] p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.source} • {item.assignedBot}</p>
                  </div>
                  <button
                    className="rounded-full bg-cyan-500 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-600"
                    onClick={async () => {
                      await fetch(item.actionWebhook, { method: 'POST' });
                      void mutate();
                    }}
                  >
                    Take Action
                  </button>
                </div>
              ))}
              {priorities.length === 0 && <p className="text-sm text-slate-500">No approvals waiting.</p>}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <KissinBooth />

          <Card>
            <CardTitle>System Health</CardTitle>
            <div className="mt-3 space-y-3">
              {health && [
                ['All Primary Systems', health.primarySystems],
                ['Bot Performance', health.botPerformance],
                ['Email Processing', health.emailProcessing],
                ['Data Sync', health.dataSync],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                    <span>{label}</span>
                    <span>{value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200/80">
                    <div className="h-2 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500" style={{ width: `${value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Pending Approvals</CardTitle>
            <div className="mt-3 space-y-2">
              {(feed?.pendingApprovals ?? []).map((item) => (
                <div key={item.category} className="rounded-xl border border-border bg-[var(--input-background)] p-3 text-sm text-slate-700">
                  {item.count} {item.description}
                </div>
              ))}
              {(feed?.pendingApprovals ?? []).length === 0 && <p className="text-sm text-slate-500">No pending approvals.</p>}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardTitle>Quick Actions</CardTitle>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/tasks" className="rounded-xl border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-700 hover:bg-white">New Task</Link>
          <Link href="/activity" className="rounded-xl border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-700 hover:bg-white">Approve Queue</Link>
          <Link href="/email" className="rounded-xl border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-700 hover:bg-white">Draft Reply</Link>
          <Link href="/finance" className="rounded-xl border border-border bg-[var(--input-background)] px-3 py-2 text-sm text-slate-700 hover:bg-white">Trophy Collection</Link>
        </div>
      </Card>
    </div>
  );
}

