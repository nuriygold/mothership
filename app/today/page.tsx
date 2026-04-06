'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Calendar, Star, CheckCircle2, Clock, Zap } from 'lucide-react';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import { KissinBooth } from '@/components/today/kissin-booth';
import type { V2TodayFeed } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const APPROVAL_BG: Record<string, string> = {
  email: 'var(--color-lavender)',
  finance: 'var(--color-peach)',
  tasks: 'var(--color-mint)',
  other: 'var(--color-sky)',
};

const APPROVAL_TEXT: Record<string, string> = {
  email: 'var(--color-lavender-text)',
  finance: 'var(--color-peach-text)',
  tasks: 'var(--color-mint-text)',
  other: 'var(--color-sky-text)',
};

const BOT_BORDER: Record<string, string> = {
  Adrian: '#E53E3E',
  Ruby: 'var(--color-purple)',
  Emerald: 'var(--color-cyan)',
  Adobe: '#FFB800',
  default: 'var(--color-purple)',
};

export default function TodayPage() {
  const { data, mutate } = useSWR<V2TodayFeed>('/api/v2/dashboard/today', fetcher, { refreshInterval: 30000 });
  const [streamStatus, setStreamStatus] = useState<'live' | 'fallback'>('fallback');

  useEffect(() => {
    const stream = new EventSource('/api/v2/stream/dashboard');
    stream.addEventListener('connected', () => setStreamStatus('live'));
    stream.addEventListener('approval.updated', () => void mutate());
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
      {/* Page heading */}
      <div>
        <h1 className="text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>{greeting}</h1>
        <p className="text-sm italic" style={{ color: 'var(--muted-foreground)' }}>You move with intention and grace.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
        <div className="space-y-4">
          {/* Timeline */}
          <Card>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" style={{ color: 'var(--color-cyan)' }} />
              <CardTitle>Today&apos;s Timeline</CardTitle>
            </div>
            <div className="mt-3 space-y-2">
              {timeline.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  No events today. Add <code className="rounded bg-[var(--muted)] px-1 text-xs">GOOGLE_CALENDAR_ID</code> to connect your calendar.
                </p>
              )}
              {timeline.map((entry, idx) => {
                const isCurrent = entry.status === 'current';
                const isDone = entry.status === 'done';
                return (
                  <div
                    key={`${entry.time}-${idx}`}
                    className="flex items-center justify-between rounded-xl p-3 transition-all"
                    style={{
                      border: isCurrent ? '1.5px solid var(--color-cyan)' : '1px solid var(--border)',
                      background: isCurrent ? 'rgba(0,217,255,0.04)' : 'var(--input-background)',
                      opacity: isDone ? 0.55 : 1,
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-semibold w-20 flex-shrink-0" style={{ color: 'var(--color-cyan)' }}>
                        {entry.time}
                      </span>
                      <span className="text-sm" style={{ color: 'var(--foreground)' }}>{entry.title}</span>
                    </div>
                    {isDone && <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-cyan)', opacity: 0.7 }} />}
                    {isCurrent && <Zap className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-cyan)' }} />}
                    {entry.status === 'upcoming' && <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--muted-foreground)', opacity: 0.5 }} />}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Top Priorities */}
          <Card>
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4" style={{ color: 'var(--color-cyan)' }} />
              <CardTitle>Top Priorities</CardTitle>
            </div>
            <CardSubtitle>High-signal tasks ready for one-click action</CardSubtitle>
            <div className="mt-3 space-y-2">
              {priorities.map((item) => {
                const borderColor = BOT_BORDER[item.assignedBot] ?? BOT_BORDER.default;
                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl p-3"
                    style={{
                      border: '1px solid var(--border)',
                      background: 'var(--input-background)',
                      borderLeft: `3px solid ${borderColor}`,
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{item.title}</p>
                      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{item.source}</p>
                    </div>
                    <button
                      className="rounded-full px-4 py-1.5 text-xs font-semibold transition-opacity hover:opacity-85"
                      style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
                      onClick={async () => {
                        await fetch(item.actionWebhook, { method: 'POST' });
                        void mutate();
                      }}
                    >
                      Take Action
                    </button>
                  </div>
                );
              })}
              {priorities.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>No approvals waiting.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <KissinBooth />

          {/* System Health */}
          <Card>
            <CardTitle>System Health</CardTitle>
            <div className="mt-3 space-y-3">
              {health && (
                [
                  ['All Primary Systems', health.primarySystems],
                  ['Bot Performance', health.botPerformance],
                  ['Email Processing', health.emailProcessing],
                  ['Data Sync', health.dataSync],
                ] as [string, number][]
              ).map(([label, value]) => (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between text-xs" style={{ color: 'var(--foreground)' }}>
                    <span>{label}</span>
                    <span style={{ color: 'var(--color-cyan)', fontWeight: 600 }}>{value}%</span>
                  </div>
                  <div className="h-1.5 rounded-full" style={{ background: 'rgba(100,130,200,0.15)' }}>
                    <div
                      className="h-1.5 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Pending Approvals */}
          <Card>
            <CardTitle>Pending Approvals</CardTitle>
            <div className="mt-3 space-y-2">
              {(feed?.pendingApprovals ?? []).map((item) => (
                <div
                  key={item.category}
                  className="rounded-xl px-3 py-2.5 text-sm"
                  style={{
                    background: APPROVAL_BG[item.category] ?? APPROVAL_BG.other,
                    color: APPROVAL_TEXT[item.category] ?? APPROVAL_TEXT.other,
                  }}
                >
                  {item.description}
                </div>
              ))}
              {(feed?.pendingApprovals ?? []).length === 0 && (
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>No pending approvals.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardTitle>Quick Actions</CardTitle>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'New Task', href: '/tasks' },
            { label: 'Approve Queue', href: '/activity' },
            { label: 'Draft Reply', href: '/email' },
            { label: 'Finance', href: '/finance' },
          ].map(({ label, href }) => (
            <Link
              key={href}
              href={href as any}
              className="rounded-xl border px-3 py-2 text-sm transition-all hover:opacity-80"
              style={{ borderColor: 'var(--border)', background: 'var(--input-background)', color: 'var(--foreground)' }}
            >
              {label}
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
