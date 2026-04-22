'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { RefreshCw } from 'lucide-react';
import type { V2ActivityFeed, V2ActivityItem } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Category logic ────────────────────────────────────────────────────────────

type Category = 'All' | 'Tasks' | 'Email' | 'Bots' | 'Campaigns' | 'Finance';

const CATEGORIES: Category[] = ['All', 'Tasks', 'Email', 'Bots', 'Campaigns', 'Finance'];

function categorise(evt: V2ActivityItem): Exclude<Category, 'All'> {
  const hay = `${evt.eventType} ${evt.description} ${evt.sourceIntegration}`.toLowerCase();
  if (/payment|invoice|bill|charge|receipt|transaction|expense|payable|revenue|subscription/.test(hay)) return 'Finance';
  if (/campaign|dispatch|execution|lane/.test(hay)) return 'Campaigns';
  if (/email|gmail|zoho|mail|inbox|draft|reply/.test(hay)) return 'Email';
  if (/task|issue|pr|pull.?request|ticket|linear/.test(hay)) return 'Tasks';
  if (evt.actor && evt.actor !== 'System' && evt.actor !== '') return 'Bots';
  return 'Tasks';
}

const DOT_COLOR: Record<Exclude<Category, 'All'>, string> = {
  Finance:   '#0470a0',
  Campaigns: '#024878',
  Email:     '#035080',
  Tasks:     '#40c8f0',
  Bots:      '#0560a0',
};

const BADGE_STYLE: Record<Exclude<Category, 'All'>, { bg: string; color: string }> = {
  Finance:   { bg: '#d0f0ff', color: '#0470a0' },
  Campaigns: { bg: '#c8eafa', color: '#024878' },
  Email:     { bg: '#c8ecfa', color: '#035080' },
  Tasks:     { bg: '#e0f4fc', color: '#2a7898' },
  Bots:      { bg: '#b8e4f8', color: '#0560a0' },
};

// ─── Relative time ─────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Pill badge ────────────────────────────────────────────────────────────────

function Pill({ text, style }: { text: string; style: { bg: string; color: string } }) {
  if (!text) return null;
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium leading-none"
      style={{ background: style.bg, color: style.color }}
    >
      {text}
    </span>
  );
}

// ─── Event card ────────────────────────────────────────────────────────────────

function EventCard({ evt }: { evt: V2ActivityItem }) {
  const cat = categorise(evt);
  const dot = DOT_COLOR[cat];
  const badge = BADGE_STYLE[cat];

  return (
    <div
      className="flex items-start gap-3 rounded-2xl px-4 py-3 transition-opacity hover:opacity-90"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      {/* Colored dot */}
      <div className="mt-1.5 flex-shrink-0">
        <span
          className="block w-2 h-2 rounded-full"
          style={{ background: dot, boxShadow: `0 0 6px ${dot}80` }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug" style={{ color: 'var(--foreground)' }}>
          {evt.description}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Pill text={cat} style={badge} />
          {evt.actor && evt.actor !== 'System' && (
            <Pill text={evt.actor} style={{ bg: '#e0f4fc', color: '#2a7898' }} />
          )}
          {evt.eventType && (
            <Pill text={evt.eventType} style={{ bg: '#e8f6ff', color: '#4a8898' }} />
          )}
          {evt.sourceIntegration && (
            <Pill text={evt.sourceIntegration} style={{ bg: '#e8f6ff', color: '#4a8898' }} />
          )}
        </div>
      </div>

      {/* Timestamp */}
      <span className="flex-shrink-0 text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
        {relativeTime(evt.timestamp)}
      </span>
    </div>
  );
}

// ─── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-2xl px-4 py-3 animate-pulse"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <div className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--muted)' }} />
          <div className="flex-1 space-y-2">
            <div className="h-3 rounded-full w-3/4" style={{ background: 'var(--muted)' }} />
            <div className="h-2.5 rounded-full w-1/3" style={{ background: 'var(--muted)' }} />
          </div>
          <div className="h-2.5 w-10 rounded-full flex-shrink-0" style={{ background: 'var(--muted)' }} />
        </div>
      ))}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [allEvents, setAllEvents] = useState<V2ActivityItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<Category>('All');
  const [search, setSearch] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const url = `/api/v2/activity/log?page=1&pageSize=50&_r=${refreshKey}`;
  const { data, isLoading, mutate } = useSWR<V2ActivityFeed>(url, fetcher, {
    refreshInterval: 30000,
    onSuccess: (fresh) => {
      if (page === 1) setAllEvents(fresh.events);
    },
  });

  // Load more
  const { data: moreData, isLoading: loadingMore } = useSWR<V2ActivityFeed>(
    page > 1 ? `/api/v2/activity/log?page=${page}&pageSize=50` : null,
    fetcher,
    {
      onSuccess: (fresh) => {
        setAllEvents((prev) => {
          const ids = new Set(prev.map((e) => e.id));
          return [...prev, ...fresh.events.filter((e) => !ids.has(e.id))];
        });
      },
    }
  );

  const hasMore = page === 1 ? (data?.hasMore ?? false) : (moreData?.hasMore ?? false);

  const filtered = useMemo(() => {
    let evts = allEvents.length > 0 ? allEvents : (data?.events ?? []);
    if (activeFilter !== 'All') {
      evts = evts.filter((e) => categorise(e) === activeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      evts = evts.filter((e) =>
        e.description.toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q) ||
        e.eventType.toLowerCase().includes(q) ||
        e.sourceIntegration.toLowerCase().includes(q)
      );
    }
    return evts;
  }, [allEvents, data, activeFilter, search]);

  function handleRefresh() {
    setPage(1);
    setAllEvents([]);
    setRefreshKey((k) => k + 1);
    void mutate();
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Activity</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
            System-wide event log · everything Mothership has done
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search events…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-2xl px-4 py-2.5 text-sm outline-none"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          color: 'var(--foreground)',
        }}
      />

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const active = cat === activeFilter;
          return (
            <button
              key={cat}
              onClick={() => setActiveFilter(cat)}
              className="rounded-full px-3 py-1 text-xs font-medium transition-all"
              style={{
                background: active ? '#0470a0' : 'var(--card)',
                color: active ? '#ffffff' : 'var(--text2)',
                border: active ? '1px solid #0470a0' : '1px solid var(--border)',
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Event list */}
      {isLoading && allEvents.length === 0 ? (
        <Skeleton />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <span className="text-4xl opacity-30">📭</span>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            {search || activeFilter !== 'All' ? 'No events match your filters.' : 'No events yet.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((evt) => <EventCard key={evt.id} evt={evt} />)}
        </div>
      )}

      {/* Footer: count + load more */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
            {activeFilter !== 'All' && ` · ${activeFilter}`}
            {search && ` · "${search}"`}
          </p>
          {hasMore && !search && activeFilter === 'All' && (
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={loadingMore}
              className="text-xs font-medium transition-opacity hover:opacity-70 disabled:opacity-40"
              style={{ color: '#0470a0' }}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
