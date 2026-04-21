'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Trophy, ChevronLeft, ChevronRight, CheckCircle2, Sparkles, Award } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type TrophyTask = {
  id: string;
  title: string;
  priority: string;
  completedAt: string;
};

type TrophyCommand = {
  id: string;
  input: string;
  channel: string;
  completedAt: string | null;
};

type TrophyData = {
  weekOffset: number;
  weekStart: string;
  weekEnd: string;
  totals: { tasks: number; commands: number };
  byDay: Record<string, TrophyTask[]>;
  tasks: TrophyTask[];
  commands: TrophyCommand[];
};

const PRIORITY_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  CRITICAL: { label: 'Critical', bg: 'rgba(239,68,68,0.12)',  color: '#fca5a5' },
  HIGH:     { label: 'High',     bg: 'rgba(245,158,11,0.12)', color: '#fcd34d' },
  MEDIUM:   { label: 'Medium',   bg: 'rgba(0,217,255,0.12)',  color: '#67e8f9' },
  LOW:      { label: 'Low',      bg: 'rgba(156,163,175,0.12)',color: '#9ca3af' },
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function fmtWeekLabel(startIso: string, endIso: string, weekOffset: number): string {
  if (weekOffset === 0) return 'This Week';
  if (weekOffset === -1) return 'Last Week';
  const start = new Date(startIso);
  const end = new Date(endIso);
  end.setDate(end.getDate() - 1);
  return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' });
}

function fmtDayHeader(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const todayStr = today.toLocaleDateString('en-CA');
  const yesterdayStr = new Date(today.getTime() - 86400000).toLocaleDateString('en-CA');
  if (dateStr === todayStr) return 'Today';
  if (dateStr === yesterdayStr) return 'Yesterday';
  return `${DAY_NAMES[date.getDay()]}, ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function Skeleton() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 rounded-full animate-pulse" style={{ background: 'var(--muted)' }} />
          {[0, 1].map((j) => (
            <div key={j} className="h-14 rounded-2xl animate-pulse" style={{ background: 'var(--card)', border: '1px solid var(--border)' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function TrophyPage() {
  const [weekOffset, setWeekOffset] = useState(0);

  const { data, isLoading } = useSWR<TrophyData>(
    `/api/v2/trophy?week=${weekOffset}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const sortedDays = useMemo(() => {
    if (!data?.byDay) return [];
    return Object.keys(data.byDay).sort((a, b) => b.localeCompare(a)); // newest first
  }, [data]);

  const weekLabel = data ? fmtWeekLabel(data.weekStart, data.weekEnd, weekOffset) : '…';
  const total = (data?.totals.tasks ?? 0) + (data?.totals.commands ?? 0);

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(217,119,6,0.15)' }}
            >
              <Trophy className="w-5 h-5" style={{ color: '#B45309' }} />
            </div>
            <h1 className="text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Trophy Collection</h1>
          </div>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Your wins, week by week
          </p>
        </div>
        <Link
          href="/today"
          className="text-xs font-medium px-3 py-2 rounded-xl transition-opacity hover:opacity-70"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
        >
          ← Today
        </Link>
      </div>

      {/* Week navigator */}
      <div
        className="flex items-center justify-between rounded-2xl px-4 py-3"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
      >
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ background: 'var(--muted)' }}
          aria-label="Previous week"
        >
          <ChevronLeft className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
        </button>

        <div className="text-center">
          <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{weekLabel}</p>
          {!isLoading && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {total === 0 ? 'No wins recorded' : `${total} win${total !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>

        <button
          onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
          disabled={weekOffset >= 0}
          className="w-8 h-8 rounded-xl flex items-center justify-center transition-opacity hover:opacity-70 disabled:opacity-30"
          style={{ background: 'var(--muted)' }}
          aria-label="Next week"
        >
          <ChevronRight className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
        </button>
      </div>

      {/* Streak badge — show only for current week */}
      {weekOffset === 0 && !isLoading && total > 0 && (
        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{
            background: 'linear-gradient(135deg, rgba(217,119,6,0.12) 0%, rgba(245,158,11,0.08) 100%)',
            border: '1px solid rgba(217,119,6,0.3)',
          }}
        >
          <span className="text-2xl">🔥</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#B45309' }}>
              {total} win{total !== 1 ? 's' : ''} this week
            </p>
            <p className="text-xs" style={{ color: 'rgba(180,83,9,0.7)' }}>Keep the momentum going</p>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <Skeleton />
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Award className="w-12 h-12 opacity-20" />
          <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
            {weekOffset === 0 ? 'No wins yet this week' : 'No wins recorded for this week'}
          </p>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Complete tasks on the Today or Tasks page to see them here
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Tasks grouped by day */}
          {sortedDays.map((day) => {
            const dayTasks = data!.byDay[day];
            return (
              <div key={day}>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                    {fmtDayHeader(day)}
                  </p>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: 'rgba(0,217,255,0.1)', color: 'var(--color-cyan)' }}
                  >
                    {dayTasks.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {dayTasks.map((task) => {
                    const badge = PRIORITY_BADGE[task.priority] ?? PRIORITY_BADGE.MEDIUM;
                    return (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 rounded-2xl px-4 py-3"
                        style={{
                          background: 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(16,185,129,0.04) 100%)',
                          border: '1px solid rgba(34,197,94,0.2)',
                        }}
                      >
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#22c55e' }} />
                        <p className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: 'var(--foreground)' }}>
                          {task.title}
                        </p>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                        <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                          {fmtTime(task.completedAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Gateway commands */}
          {(data?.commands ?? []).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>
                  Gateway Commands
                </p>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: 'rgba(0,217,255,0.1)', color: 'var(--color-cyan)' }}
                >
                  {data!.commands.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {data!.commands.map((cmd) => (
                  <div
                    key={cmd.id}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3"
                    style={{
                      background: 'rgba(0,217,255,0.06)',
                      border: '1px solid rgba(0,217,255,0.15)',
                    }}
                  >
                    <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-cyan)' }} />
                    <p className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--foreground)' }}>{cmd.input}</p>
                    {cmd.completedAt && (
                      <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--muted-foreground)' }}>
                        {fmtTime(cmd.completedAt)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
