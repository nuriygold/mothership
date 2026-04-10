'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  TrendingUp, Mail, Search, FileText,
  CheckCircle2, Settings, ChevronDown,
  WifiOff, Users,
} from 'lucide-react';
import type { V2BotProfile, V2BotsFeed } from '@/lib/v2/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Text color safe for always-light pastel card backgrounds (no dark-mode override on pastels)
const CARD_FG = '#0F1B35';

const COLOR_SCHEME: Record<string, { bg: string; text: string }> = {
  mint:     { bg: 'var(--color-mint)',     text: 'var(--color-mint-text)'     },
  pink:     { bg: 'var(--color-pink)',     text: 'var(--color-pink-text)'     },
  sky:      { bg: 'var(--color-sky)',      text: 'var(--color-sky-text)'      },
  lemon:    { bg: 'var(--color-lemon)',    text: 'var(--color-lemon-text)'    },
  lavender: { bg: 'var(--color-lavender)', text: 'var(--color-lavender-text)' },
};

const BOT_ICON: Record<string, React.ElementType> = {
  'trending-up': TrendingUp,
  'mail':        Mail,
  'search':      Search,
  'file-text':   FileText,
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  active:  { color: 'var(--color-cyan)', label: 'Active'  },
  working: { color: 'var(--color-cyan)', label: 'Working' },
  idle:    { color: '#FFB800',           label: 'Idle'    },
  pending: { color: '#FFB800',           label: 'Pending' },
  blocked: { color: '#E53E3E',           label: 'Blocked' },
  done:    { color: 'var(--color-cyan)', label: 'Done'    },
};

function BotCardSkeleton() {
  return (
    <div
      className="rounded-3xl p-5 flex flex-col gap-4 animate-pulse"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ background: 'var(--muted)' }} />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-28 rounded-full" style={{ background: 'var(--muted)' }} />
          <div className="h-3 w-20 rounded-full" style={{ background: 'var(--muted)' }} />
        </div>
      </div>
      <div className="rounded-2xl h-16" style={{ background: 'var(--muted)' }} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 rounded-2xl" style={{ background: 'var(--muted)' }} />
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-3 w-32 rounded-full" style={{ background: 'var(--muted)' }} />
        <div className="h-3 w-full rounded-full" style={{ background: 'var(--muted)' }} />
        <div className="h-3 w-4/5 rounded-full" style={{ background: 'var(--muted)' }} />
      </div>
      <div className="flex gap-2 mt-auto">
        <div className="flex-1 h-11 rounded-2xl" style={{ background: 'var(--muted)' }} />
        <div className="w-11 h-11 rounded-2xl" style={{ background: 'var(--muted)' }} />
      </div>
    </div>
  );
}

function BotCard({ bot }: { bot: V2BotProfile }) {
  const [expanded, setExpanded] = useState(false);

  const scheme = COLOR_SCHEME[bot.identity.colorKey] ?? COLOR_SCHEME.lavender;
  const BotIcon = BOT_ICON[bot.identity.iconKey] ?? FileText;
  const statusConfig = STATUS_CONFIG[bot.liveState.status] ?? STATUS_CONFIG.idle;
  const isIdle = bot.liveState.status === 'idle' || bot.liveState.status === 'pending';
  const currentTaskIsPlaceholder =
    bot.liveState.currentTask === 'Awaiting assignment' || bot.liveState.currentTask === '';

  const visibleOutputs = bot.recentOutputs.slice(0, expanded ? undefined : 3);
  const hasMore = !expanded && bot.recentOutputs.length > 3;

  return (
    <div
      className="rounded-3xl p-5 flex flex-col"
      style={{ background: scheme.bg, border: '1px solid rgba(0,0,0,0.06)' }}
    >
      {/* Header: icon + name/role + status */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)' }}
          >
            <BotIcon className="w-5 h-5" style={{ color: scheme.text }} />
          </div>
          <div>
            <h3 className="text-lg font-semibold leading-tight" style={{ color: CARD_FG }}>
              {bot.identity.name}
            </h3>
            <p className="text-xs" style={{ color: scheme.text }}>{bot.identity.role}</p>
          </div>
        </div>
        {/* Status indicator: dot + text label */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: statusConfig.color }}
          />
          <span className="text-xs font-medium" style={{ color: statusConfig.color }}>
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Currently working on */}
      <div
        className="rounded-2xl px-4 py-3 mb-4"
        style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)' }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: scheme.text }}>
          Currently
        </p>
        {isIdle || currentTaskIsPlaceholder ? (
          <p className="text-sm italic" style={{ color: CARD_FG, opacity: 0.5 }}>
            {currentTaskIsPlaceholder ? 'No active task' : bot.liveState.currentTask}
          </p>
        ) : (
          <p className="text-sm font-medium" style={{ color: CARD_FG }}>
            {bot.liveState.currentTask}
          </p>
        )}
      </div>

      {/* Throughput metrics — neutral white-alpha cells to avoid pastel-on-pastel conflict */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Completed', value: bot.throughputMetrics.completed },
          { label: 'Queued',    value: bot.throughputMetrics.queued    },
          { label: 'Blocked',   value: bot.throughputMetrics.blocked   },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-2xl py-3 text-center"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,0,0,0.04)' }}
          >
            <p className="text-xl font-bold" style={{ color: CARD_FG }}>{value}</p>
            <p className="text-[10px] font-medium" style={{ color: scheme.text }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Recent outputs — always rendered for consistent card height */}
      <div className="mb-4">
        <p className="text-xs font-semibold mb-2" style={{ color: scheme.text }}>Recent Outputs</p>
        <div className="space-y-1.5 min-h-[4.5rem]">
          {bot.recentOutputs.length === 0 ? (
            <p className="text-sm italic" style={{ color: CARD_FG, opacity: 0.45 }}>No recent outputs</p>
          ) : (
            <>
              {visibleOutputs.map((output, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2
                      className="w-3.5 h-3.5 flex-shrink-0"
                      style={{ color: 'var(--color-cyan)' }}
                    />
                    <span className="text-sm truncate" style={{ color: CARD_FG }}>{output.title}</span>
                  </div>
                  <span
                    className="text-[11px] flex-shrink-0 ml-2"
                    style={{ color: scheme.text, opacity: 0.8 }}
                  >
                    {output.timestamp}
                  </span>
                </div>
              ))}
              {hasMore && (
                <button
                  onClick={() => setExpanded(true)}
                  className="flex items-center gap-1 text-xs font-medium mt-1 transition-opacity hover:opacity-70"
                  style={{ color: scheme.text }}
                >
                  Show all ({bot.recentOutputs.length})
                  <ChevronDown className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Working style */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: scheme.text }}>
          Working Style
        </p>
        <p className="text-sm" style={{ color: CARD_FG }}>{bot.staticProfile.workingStyle}</p>
      </div>

      {/* Personality */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: scheme.text }}>
          Personality
        </p>
        <p className="text-sm italic" style={{ color: CARD_FG }}>{bot.staticProfile.personality}</p>
      </div>

      {/* Strengths */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: scheme.text }}>
          Strengths
        </p>
        <div className="flex flex-wrap gap-1.5">
          {bot.staticProfile.strengths.map((s) => (
            <span
              key={s}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                background: 'rgba(255,255,255,0.6)',
                color: CARD_FG,
                border: '1px solid rgba(255,255,255,0.8)',
              }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Footer: actions — disabled until detail pages exist */}
      <div className="mt-auto flex items-center gap-2">
        <button
          disabled
          title="Bot detail pages coming soon"
          className="flex-1 rounded-2xl py-3 text-sm font-semibold text-center opacity-40 cursor-not-allowed"
          style={{ background: 'var(--color-purple)', color: '#FFFFFF' }}
        >
          View Details
        </button>
        <button
          disabled
          title="Bot settings coming soon"
          className="w-11 h-11 rounded-2xl flex items-center justify-center opacity-40 cursor-not-allowed"
          style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)' }}
        >
          <Settings className="w-4 h-4" style={{ color: scheme.text }} />
        </button>
      </div>
    </div>
  );
}

export default function BotsPage() {
  const { data, error, mutate } = useSWR<V2BotsFeed>('/api/v2/bots', fetcher, { refreshInterval: 30000 });
  const [streamStatus, setStreamStatus] = useState<'live' | 'fallback'>('fallback');

  useEffect(() => {
    const stream = new EventSource('/api/v2/stream/bots');
    stream.addEventListener('connected', () => setStreamStatus('live'));
    stream.addEventListener('task.routed', () => void mutate());
    stream.onerror = () => setStreamStatus('fallback');
    return () => stream.close();
  }, [mutate]);

  const isLoading = !data && !error;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Bots</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Your staffed operations bench
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-medium self-start sm:self-auto"
          style={{
            background: streamStatus === 'live' ? 'var(--color-mint)' : 'var(--color-lemon)',
            color: streamStatus === 'live' ? 'var(--color-mint-text)' : 'var(--color-lemon-text)',
          }}
        >
          {streamStatus === 'live' ? 'Live' : 'Refreshing'}
        </span>
      </div>

      {/* Error state */}
      {error && (
        <div
          className="rounded-3xl p-10 flex flex-col items-center gap-3 text-center"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <WifiOff className="w-8 h-8 opacity-40" style={{ color: 'var(--foreground)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
            Unable to load bots
          </p>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Check your connection or try again
          </p>
          <button
            onClick={() => void mutate()}
            className="mt-2 rounded-xl px-4 py-2 text-sm font-medium transition-opacity hover:opacity-85"
            style={{ background: 'var(--color-purple)', color: '#fff' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <BotCardSkeleton key={i} />)}
        </div>
      )}

      {/* Bot grid */}
      {data && (
        <div className="grid gap-5 md:grid-cols-2">
          {data.bots.length === 0 ? (
              <div
               className="md:col-span-2 rounded-3xl p-10 flex flex-col items-center gap-3 text-center"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <Users className="w-8 h-8 opacity-30" style={{ color: 'var(--foreground)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                No bots on the bench yet
              </p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Bots will appear here once they&apos;re assigned tasks.
              </p>
            </div>
          ) : (
            data.bots.map((bot) => <BotCard key={bot.identity.name} bot={bot} />)
          )}
        </div>
      )}
    </div>
  );
}
