'use client';

import { useState, useMemo, useCallback } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { V2ActivityFeed, V2ActivityItem } from '@/lib/v2/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

type FilterCategory = 'All' | 'Tasks' | 'Email' | 'Bots' | 'Campaigns' | 'Finance';

const FILTER_PILLS: FilterCategory[] = ['All', 'Tasks', 'Email', 'Bots', 'Campaigns', 'Finance'];

// ─── Category helpers ─────────────────────────────────────────────────────────

type CategoryMeta = {
  label: FilterCategory;
  dot: string;      // inline bg color for the dot
  bg: string;       // badge background
  text: string;     // badge text color
};

function categorise(evt: V2ActivityItem): CategoryMeta {
  const et = (evt.eventType ?? '').toLowerCase();
  const src = (evt.sourceIntegration ?? '').toLowerCase();
  const actor = (evt.actor ?? '').toLowerCase();

  // Finance
  if (et.includes('payment') || et.includes('invoice') || et.includes('finance') || et.includes('transaction')) {
    return { label: 'Finance', dot: '#22c55e', bg: 'var(--color-mint)', text: 'var(--color-mint-text)' };
  }
  // Campaign
  if (et.includes('campaign') || et.includes('dispatch')) {
    return { label: 'Campaigns', dot: '#a78bfa', bg: 'var(--color-lavender)', text: 'var(--color-lavender-text)' };
  }
  // Email
  if (et.includes('email') || src.includes('gmail') || src.includes('zoho') || src.includes('mail')) {
    return { label: 'Email', dot: '#f472b6', bg: 'var(--color-pink)', text: 'var(--color-pink-text)' };
  }
  // Task
  if (et.includes('task') || et.includes('issue') || et.includes('pr') || et.includes('pull')) {
    return { label: 'Tasks', dot: '#00D9FF', bg: 'var(--color-sky)', text: 'var(--color-sky-text)' };
  }
  // Bot (actor is not "system" and not empty)
  if (actor && actor !== 'system') {
    return { label: 'Bots', dot: '#34d399', bg: 'var(--color-mint)', text: 'var(--color-mint-text)' };
  }
  // Default / System
  return { label: 'All', dot: '#94a3b8', bg: 'var(--muted)', text: 'var(--muted-foreground)' };
}

function matchesCategory(evt: V2ActivityItem, filter: FilterCategory): boolean {
  if (filter === 'All') return true;
  return categorise(evt).label === filter;
}

// ─── Relative time ────────────────────────────────────────────────────────────

function relativeTime(isoTimestamp: string): string {
  const diff = Date.now() - new Date(isoTimestamp).getTime();
  const sec  = Math.floor(diff / 1000);
  if (sec < 60)  return `${sec}s ago`;
  const min  = Math.floor(sec / 60);
  if (min < 60)  return `${min}m ago`;
  const hr   = Math.floor(min / 60);
  if (hr  < 24)  return `${hr}h ago`;
  const day  = Math.floor(hr  / 24);
  if (day === 1) return 'Yesterday';
  if (day <   7) return `${day}d ago`;
  return new Date(isoTimestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function buildUrl(page: number) {
  return `/api/v2/activity/log?page=${page}&pageSize=${PAGE_SIZE}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl animate-pulse"
          style={{ height: '60px', background: 'var(--muted)' }}
        />
      ))}
    </div>
  );
}

function EmptyState({ filter, search }: { filter: FilterCategory; search: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-20 gap-3 rounded-2xl"
      style={{ background: 'var(--muted)' }}
    >
      {/* Simple inbox icon via SVG */}
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 12h-6l-2 3H10l-2-3H2" />
        <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
      </svg>
      <p className="text-sm font-medium" style={{ color: 'var(--muted-foreground)' }}>
        No events found
      </p>
      <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
        {search
          ? `No results for "${search}"${filter !== 'All' ? ` in ${filter}` : ''}`
          : filter !== 'All'
          ? `No ${filter.toLowerCase()} events yet`
          : 'No activity has been recorded yet'}
      </p>
    </div>
  );
}

function EventCard({ evt }: { evt: V2ActivityItem }) {
  const cat = categorise(evt);
  const isSystem = !evt.actor || evt.actor.toLowerCase() === 'system';

  return (
    <div
      className="flex items-start gap-3 rounded-xl px-4 py-3 transition-colors"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      {/* Colored dot */}
      <div className="flex-shrink-0 mt-1.5">
        <div
          className="rounded-full"
          style={{ width: '8px', height: '8px', background: cat.dot, boxShadow: `0 0 4px ${cat.dot}80` }}
        />
      </div>

      {/* Center: description + badges */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>
          {evt.description}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {/* Actor badge */}
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
            style={{ background: cat.bg, color: cat.text }}
          >
            {isSystem ? 'System' : evt.actor}
          </span>

          {/* Event type tag */}
          {evt.eventType && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
              style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
            >
              {evt.eventType}
            </span>
          )}

          {/* Source integration tag */}
          {evt.sourceIntegration && evt.sourceIntegration !== 'Internal' && (
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
              style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
            >
              {evt.sourceIntegration}
            </span>
          )}
        </div>
      </div>

      {/* Right: relative time */}
      <div className="flex-shrink-0 text-right">
        <span className="text-xs whitespace-nowrap" style={{ color: 'var(--muted-foreground)' }}>
          {relativeTime(evt.timestamp)}
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const [page, setPage]           = useState(1);
  const [filter, setFilter]       = useState<FilterCategory>('All');
  const [search, setSearch]       = useState('');
  // Accumulate pages of events so "Load more" appends rather than replaces
  const [allEvents, setAllEvents] = useState<V2ActivityItem[]>([]);

  const { data, isLoading, mutate } = useSWR<V2ActivityFeed>(
    buildUrl(page),
    fetcher,
    {
      refreshInterval: 30_000,
      onSuccess: (incoming) => {
        if (page === 1) {
          setAllEvents(incoming.events ?? []);
        } else {
          setAllEvents((prev) => {
            const existingIds = new Set(prev.map((e) => e.id));
            const newEvts = (incoming.events ?? []).filter((e) => !existingIds.has(e.id));
            return [...prev, ...newEvts];
          });
        }
      },
    },
  );

  const handleRefresh = useCallback(() => {
    setPage(1);
    setAllEvents([]);
    void mutate();
  }, [mutate]);

  const handleLoadMore = useCallback(() => {
    setPage((p) => p + 1);
  }, []);

  // ── Client-side filter + search ───────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      allEvents.filter(
        (evt) =>
          matchesCategory(evt, filter) &&
          (!q ||
            evt.description?.toLowerCase().includes(q) ||
            evt.actor?.toLowerCase().includes(q) ||
            evt.eventType?.toLowerCase().includes(q) ||
            evt.sourceIntegration?.toLowerCase().includes(q)),
      ),
    [allEvents, filter, q],
  );

  const hasMore = data?.hasMore ?? false;
  const showEmpty = !isLoading && filtered.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>
            Activity
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            System-wide event log
          </p>
        </div>

        {/* Refresh button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: isLoading ? 0.5 : 1 }}
          >
            <path d="M23 4v6h-6" />
            <path d="M1 20v-6h6" />
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
          </svg>
          Refresh
        </Button>
      </div>

      {/* ── Filters + search bar ────────────────────────────────────────────────── */}
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        {/* Filter pills */}
        <div className="flex flex-wrap gap-1.5 flex-1">
          {FILTER_PILLS.map((pill) => {
            const active = filter === pill;
            return (
              <button
                key={pill}
                onClick={() => setFilter(pill)}
                className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                style={{
                  background: active ? 'var(--primary)' : 'var(--muted)',
                  color: active ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {pill}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative flex-shrink-0 sm:w-56">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search events…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2"
            style={{
              background: 'var(--input-background)',
              border: '1px solid var(--border)',
              color: 'var(--foreground)',
            }}
          />
        </div>
      </Card>

      {/* ── Event list ──────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        {isLoading && allEvents.length === 0 ? (
          <LoadingSkeleton />
        ) : showEmpty ? (
          <EmptyState filter={filter} search={search} />
        ) : (
          <>
            {filtered.map((evt) => (
              <EventCard key={evt.id} evt={evt} />
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={isLoading}
                >
                  {isLoading ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            )}

            {/* Count summary */}
            {filtered.length > 0 && (
              <p className="text-center text-xs pt-1" style={{ color: 'var(--muted-foreground)' }}>
                Showing {filtered.length} event{filtered.length !== 1 ? 's' : ''}
                {filter !== 'All' ? ` · ${filter}` : ''}
                {q ? ` · "${search}"` : ''}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
