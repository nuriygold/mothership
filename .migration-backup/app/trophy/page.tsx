'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Trophy, ChevronLeft, ChevronRight, CheckCircle2, Sparkles, Award, Undo2, HeartPulse } from 'lucide-react';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type TrophyTask = {
  id: string;
  title: string;
  priority: string;
  completedAt: string;
};

type AnchorTrophy = {
  id: string;
  date: string;       // YYYY-MM-DD
  completedAt: string;
};

type CampaignTrophy = {
  id: string;
  title: string;
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
  totals: { tasks: number; commands: number; anchors?: number; campaigns?: number };
  byDay: Record<string, TrophyTask[]>;
  tasks: TrophyTask[];
  commands: TrophyCommand[];
  anchors?: AnchorTrophy[];
  campaigns?: CampaignTrophy[];
};

const PRIORITY_BADGE: Record<string, { label: string; bg: string; color: string; bar: string }> = {
  CRITICAL: { label: 'Critical', bg: '#d0f0ff', color: '#0470a0', bar: '#0470a0' },
  HIGH:     { label: 'High',     bg: '#c8ecfa', color: '#035080', bar: '#50a0c8' },
  MEDIUM:   { label: 'Medium',   bg: '#e0f4fc', color: '#2a7898', bar: '#90c0d8' },
  LOW:      { label: 'Low',      bg: '#f0f8ff', color: '#4a8898', bar: '#b8d8e8' },
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
          <div className="h-3 w-24 rounded-full animate-pulse" style={{ background: 'var(--bg3)' }} />
          {[0, 1].map((j) => (
            <div key={j} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--bg2)', border: '1px solid var(--border-c)' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function TrophyPage() {
  const [weekOffset, setWeekOffset] = useState(0);

  const { data, isLoading, mutate } = useSWR<TrophyData>(
    `/api/v2/trophy?week=${weekOffset}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const sortedDays = useMemo(() => {
    if (!data?.byDay) return [];
    return Object.keys(data.byDay).sort((a, b) => b.localeCompare(a));
  }, [data]);

  const weekLabel = data ? fmtWeekLabel(data.weekStart, data.weekEnd, weekOffset) : '…';
  const anchors = data?.anchors ?? [];
  const campaignTrophies = data?.campaigns ?? [];
  const total = (data?.totals.tasks ?? 0) + (data?.totals.commands ?? 0) + anchors.length + campaignTrophies.length;

  // ── Undo a task trophy (send it back to the pool) ────────────────────────────
  const [undoing, setUndoing] = useState<Set<string>>(new Set());
  const undoTask = async (taskId: string) => {
    setUndoing((p) => new Set(p).add(taskId));
    try {
      await fetch(`/api/v2/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'defer' }),
      });
      await mutate();
    } finally {
      setUndoing((p) => { const n = new Set(p); n.delete(taskId); return n; });
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto">
      {/* Header — gold, matches the Trophy icon used elsewhere (Today/quick actions) */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(184,144,42,0.12)', border: '1px solid rgba(184,144,42,0.45)' }}
            >
              <Trophy className="w-5 h-5" style={{ color: '#b8902a' }} />
            </div>
            <h1 style={{ fontFamily: 'var(--font-rajdhani)', fontSize: '22px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#b8902a' }}>
              Trophies
            </h1>
          </div>
          <p className="text-xs" style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
            The trophy case · every win, week by week
          </p>
        </div>
        <Link
          href="/today"
          className="text-xs font-medium px-3 py-2 rounded-lg transition-opacity hover:opacity-70"
          style={{ background: 'var(--bg2)', border: '1px solid var(--border-c)', color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}
        >
          ← Today
        </Link>
      </div>

      {/* Week navigator */}
      <div
        className="flex items-center justify-between rounded-xl px-4 py-3"
        style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #90c8e0' }}
      >
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border-c)' }}
          aria-label="Previous week"
        >
          <ChevronLeft className="w-4 h-4" style={{ color: 'var(--text2)' }} />
        </button>

        <div className="text-center">
          <p className="text-sm font-semibold" style={{ color: 'var(--text)', fontFamily: 'var(--font-rajdhani)', letterSpacing: '0.5px' }}>{weekLabel}</p>
          {!isLoading && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
              {total === 0 ? 'No wins recorded' : `${total} win${total !== 1 ? 's' : ''}`}
            </p>
          )}
        </div>

        <button
          onClick={() => setWeekOffset((w) => Math.min(0, w + 1))}
          disabled={weekOffset >= 0}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-70 disabled:opacity-30"
          style={{ background: 'var(--bg3)', border: '1px solid var(--border-c)' }}
          aria-label="Next week"
        >
          <ChevronRight className="w-4 h-4" style={{ color: 'var(--text2)' }} />
        </button>
      </div>

      {/* Win streak banner */}
      {weekOffset === 0 && !isLoading && total > 0 && (
        <div
          className="flex items-center gap-3 rounded-xl px-4 py-3"
          style={{
            background: 'linear-gradient(135deg, #d0f0ff 0%, #c8ecfa 100%)',
            border: '1px solid #90d8f0',
          }}
        >
          <span className="text-2xl">🔥</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#0470a0', fontFamily: 'var(--font-rajdhani)', letterSpacing: '0.5px' }}>
              {total} win{total !== 1 ? 's' : ''} this week
            </p>
            <p className="text-xs" style={{ color: '#2a7898', fontFamily: 'var(--font-mono)' }}>Keep the momentum going</p>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <Skeleton />
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Award className="w-12 h-12" style={{ color: 'var(--border-c)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>
            {weekOffset === 0 ? 'No wins yet this week' : 'No wins recorded for this week'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
            Complete tasks on the Today or Tasks page to see them here
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* ── Trophy Case — completed tasks by day ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#b8902a', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700 }}>
                Trophy Case
              </p>
              <span
                className="rounded px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: 'rgba(184,144,42,0.12)', color: '#b8902a', border: '1px solid rgba(184,144,42,0.35)', fontFamily: 'var(--font-mono)' }}
              >
                {data?.totals.tasks ?? 0}
              </span>
            </div>
            {sortedDays.map((day) => {
              const dayTasks = data!.byDay[day];
              return (
                <div key={day} className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      {fmtDayHeader(day)}
                    </p>
                    <span
                      className="rounded px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: '#d0f0ff', color: '#0470a0', border: '1px solid #90d8f0', fontFamily: 'var(--font-mono)' }}
                    >
                      {dayTasks.length}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #90c8e0', borderRadius: '12px', overflow: 'hidden' }}>
                    {dayTasks.map((task, i) => {
                      const badge = PRIORITY_BADGE[task.priority.toUpperCase()] ?? PRIORITY_BADGE.MEDIUM;
                      const isUndoing = undoing.has(task.id);
                      return (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 px-4 py-3"
                          style={{
                            borderBottom: i < dayTasks.length - 1 ? '1px solid var(--bg3)' : 'none',
                          }}
                        >
                          <div style={{ width: 3, borderRadius: 2, alignSelf: 'stretch', minHeight: 32, background: badge.bar, flexShrink: 0 }} />
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: '#b8902a' }} />
                          <p className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
                            {task.title}
                          </p>
                          <button
                            type="button"
                            onClick={() => undoTask(task.id)}
                            disabled={isUndoing}
                            title="Put this back in the pool"
                            aria-label="Undo — send this task back to the pool"
                            className="rounded-md p-1 transition-opacity hover:opacity-70 disabled:opacity-40"
                            style={{ background: 'transparent', border: '1px solid var(--border-c)', color: 'var(--text3)' }}
                          >
                            <Undo2 className="w-3 h-3" />
                          </button>
                          <span
                            className="rounded px-2 py-0.5 text-[10px] font-medium flex-shrink-0"
                            style={{ background: badge.bg, color: badge.color, fontFamily: 'var(--font-mono)' }}
                          >
                            {badge.label}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', flexShrink: 0, color: 'var(--text3)' }}>
                            {fmtTime(task.completedAt)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Daily Anchors trophies — awarded when all 6 anchors complete in a day ── */}
          {anchors.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#b8902a', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700 }}>
                  Daily Anchors
                </p>
                <span
                  className="rounded px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: 'rgba(184,144,42,0.12)', color: '#b8902a', border: '1px solid rgba(184,144,42,0.35)', fontFamily: 'var(--font-mono)' }}
                >
                  {anchors.length}
                </span>
              </div>
              <div className="flex flex-col gap-0" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(184,144,42,0.35)', borderRadius: '12px', overflow: 'hidden' }}>
                {anchors.map((a, i) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ borderBottom: i < anchors.length - 1 ? '1px solid var(--bg3)' : 'none' }}
                  >
                    <HeartPulse className="w-4 h-4 flex-shrink-0" style={{ color: '#b8902a' }} />
                    <p className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
                      All six daily anchors complete
                    </p>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', flexShrink: 0, color: 'var(--text3)' }}>
                      {fmtDayHeader(a.date)} · {fmtTime(a.completedAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Campaigns trophied from Dispatch ── */}
          {campaignTrophies.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: '#b8902a', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: 700 }}>
                  Campaigns
                </p>
                <span
                  className="rounded px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: 'rgba(184,144,42,0.12)', color: '#b8902a', border: '1px solid rgba(184,144,42,0.35)', fontFamily: 'var(--font-mono)' }}
                >
                  {campaignTrophies.length}
                </span>
              </div>
              <div className="flex flex-col gap-0" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(184,144,42,0.35)', borderRadius: '12px', overflow: 'hidden' }}>
                {campaignTrophies.map((c, i) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ borderBottom: i < campaignTrophies.length - 1 ? '1px solid var(--bg3)' : 'none' }}
                  >
                    <Trophy className="w-4 h-4 flex-shrink-0" style={{ color: '#b8902a' }} />
                    <p className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--text)' }}>
                      {c.title}
                    </p>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', flexShrink: 0, color: 'var(--text3)' }}>
                      {fmtTime(c.completedAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Gateway commands ── */}
          {(data?.commands ?? []).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Gateway Commands
                </p>
                <span
                  className="rounded px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: '#c8ecfa', color: '#035080', border: '1px solid #90c8e0', fontFamily: 'var(--font-mono)' }}
                >
                  {data!.commands.length}
                </span>
              </div>
              <div className="flex flex-col gap-0" style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid #90c8e0', borderRadius: '12px', overflow: 'hidden' }}>
                {data!.commands.map((cmd, i) => (
                  <div
                    key={cmd.id}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ borderBottom: i < data!.commands.length - 1 ? '1px solid var(--bg3)' : 'none' }}
                  >
                    <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: '#035080' }} />
                    <p className="text-sm flex-1 min-w-0 truncate" style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>{cmd.input}</p>
                    {cmd.completedAt && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', flexShrink: 0, color: 'var(--text3)' }}>
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

      {/* ── Drake — bottom of the case ── matches the Today page affirmation style. */}
      <div
        className="rounded-xl px-5 py-5 mt-2"
        style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(184,144,42,0.35)' }}
      >
        <p
          style={{
            fontFamily: 'var(--font-script)',
            fontSize: '29px',
            fontWeight: 600,
            lineHeight: 1.25,
            color: 'var(--ice-gold)',
            margin: 0,
            textShadow: '0 1px 2px rgba(184,144,42,0.18)',
          }}
        >
          Keep building the case. Add a win. Come back tomorrow.
        </p>
        <p
          className="mt-3"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text3)',
            opacity: 0.8,
          }}
        >
          — Drake · 6 God energy
        </p>
      </div>
    </div>
  );
}
