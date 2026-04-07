'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Calendar, Star, CheckCircle2, Clock, Zap, Video,
  GripVertical, Target, Sparkles, Trophy, Plus,
  ListChecks, MessageSquare, X, Award, ChevronDown,
  Send, UserPlus, Droplets, Footprints, Dumbbell, Heart, BookOpen,
} from 'lucide-react';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import { KissinBooth } from '@/components/today/kissin-booth';
import { LiveRuby } from '@/components/today/live-ruby';
import type { V2DashboardTimelineItem, V2TodayFeed } from '@/lib/v2/types';
import type { CalendarEvent } from '@/lib/services/calendar';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Bot → Telegram bot key mapping
const BOT_TELEGRAM_KEY: Record<string, string> = {
  Adrian: 'bot1',
  Ruby: 'bot2',
  Emerald: 'bot3',
  Adobe: 'botAdobe',
  'Adobe Pettaway': 'botAdobe',
};

const ALL_BOTS = ['Adrian', 'Ruby', 'Emerald', 'Adobe'];

const BOT_COLORS: Record<string, { bg: string; text: string }> = {
  Adrian: { bg: 'var(--color-peach)', text: 'var(--color-peach-text)' },
  Ruby: { bg: 'var(--color-pink)', text: 'var(--color-pink-text)' },
  Emerald: { bg: 'var(--color-mint)', text: 'var(--color-mint-text)' },
  Adobe: { bg: 'var(--color-lemon)', text: 'var(--color-lemon-text)' },
};

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

const TIMELINE_ICON_MAP = {
  check: CheckCircle2,
  clock: Clock,
  alert: Sparkles,
  spark: Zap,
  focus: Target,
};

// ── Trophy Modal ──
type TrophyData = {
  since: string;
  totals: { tasks: number; commands: number; events: number };
  tasks: Array<{ id: string; title: string; priority: string; completedAt: string }>;
  commands: Array<{ id: string; input: string; channel: string; completedAt: string | null }>;
};

function TrophyModal({
  onClose,
  localCompletions,
  completedIds,
  onUndoTask,
}: {
  onClose: () => void;
  localCompletions: string[];
  completedIds: Set<string>;
  onUndoTask: (taskId: string) => void;
}) {
  const { data, isLoading } = useSWR<TrophyData>('/api/v2/trophy', fetcher, { revalidateOnMount: true });

  // Merge server tasks with locally completed task titles
  const allTasks = useMemo(() => {
    const server = data?.tasks ?? [];
    const localItems = localCompletions.map((title, i) => ({
      id: `local-${i}`,
      title,
      priority: 'high',
      completedAt: new Date().toISOString(),
    }));
    // Deduplicate by title
    const seen = new Set(server.map((t) => t.title));
    const merged = [...server, ...localItems.filter((t) => !seen.has(t.title))];
    return merged.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  }, [data, localCompletions]);

  const total = allTasks.length + (data?.commands ?? []).length;

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-3xl flex flex-col"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          maxHeight: '80vh',
          boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 rounded-t-3xl flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%)', borderBottom: '1px solid rgba(0,0,0,0.06)' }}
        >
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(217,119,6,0.15)' }}>
            <Trophy className="w-5 h-5" style={{ color: '#B45309' }} />
          </div>
          <div>
            <h2 className="text-base font-semibold" style={{ color: '#0F1B35' }}>Trophy Collection</h2>
            <p className="text-xs" style={{ color: '#92400E' }}>
              {isLoading ? 'Loading…' : `${total} win${total !== 1 ? 's' : ''} in the last 24 hours`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto w-8 h-8 rounded-xl flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ background: 'rgba(0,0,0,0.06)' }}
          >
            <X className="w-4 h-4" style={{ color: '#0F1B35' }} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-hide">
          {isLoading && (
            <div className="py-8 text-center">
              <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-2" style={{ borderColor: '#FFB800', borderTopColor: 'transparent' }} />
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Counting your wins…</p>
            </div>
          )}

          {!isLoading && total === 0 && (
            <div className="py-8 text-center">
              <Award className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>Nothing completed yet today</p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>Mark tasks done in the timeline to see them here</p>
            </div>
          )}

          {/* Completed Tasks */}
          {allTasks.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--muted-foreground)' }}>
                Tasks Completed · {allTasks.length}
              </p>
              <div className="space-y-2">
                {allTasks.map((task) => {
                  const isLocallyDone = task.id.startsWith('local-') ? completedIds.size > 0 : completedIds.has(task.id);
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                      style={{ background: 'var(--color-mint)', border: '1px solid rgba(0,0,0,0.04)' }}
                    >
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-mint-text)' }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" style={{ color: '#0F1B35' }}>{task.title}</p>
                      </div>
                      <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--color-mint-text)', opacity: 0.75 }}>
                        {fmtTime(task.completedAt)}
                      </span>
                      {/* Oops button — only for locally tracked completions */}
                      {!task.id.startsWith('local-') && (
                        <button
                          onClick={() => { onUndoTask(task.id); onClose(); }}
                          className="rounded-xl px-2 py-1 text-[10px] font-medium flex items-center gap-1 flex-shrink-0 hover:opacity-80 transition-opacity"
                          style={{ background: 'rgba(0,0,0,0.08)', color: '#0F1B35' }}
                          title="Mark as not done"
                        >
                          <RotateCcw className="w-2.5 h-2.5" /> Oops
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Commands */}
          {(data?.commands ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--muted-foreground)' }}>
                Gateway Commands · {data!.commands.length}
              </p>
              <div className="space-y-2">
                {data!.commands.map((cmd) => (
                  <div
                    key={cmd.id}
                    className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                    style={{ background: 'var(--color-sky)', border: '1px solid rgba(0,0,0,0.04)' }}
                  >
                    <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-sky-text)' }} />
                    <p className="text-sm truncate flex-1" style={{ color: '#0F1B35' }}>{cmd.input}</p>
                    {cmd.completedAt && (
                      <span className="text-[11px] flex-shrink-0" style={{ color: 'var(--color-sky-text)', opacity: 0.75 }}>
                        {fmtTime(cmd.completedAt)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex-shrink-0 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>Resets at midnight</p>
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ background: '#B45309', color: '#FFFFFF' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Now Line ──────────────────────────────────────────────────────────────────
function NowLine() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setTime(new Date()), 60000); return () => clearInterval(i); }, []);
  const label = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="relative flex items-center my-2" style={{ zIndex: 10 }}>
      <span className="absolute -top-4 left-0 text-[10px] font-semibold" style={{ color: 'var(--color-cyan)' }}>
        {label}
      </span>
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'var(--color-cyan)', boxShadow: '0 0 6px rgba(0,217,255,0.6)' }} />
      <div className="flex-1 h-px" style={{ background: 'var(--color-cyan)', opacity: 0.7 }} />
    </div>
  );
}

// ── Assign-To Dropdown ────────────────────────────────────────────────────────
function AssignToDropdown({ currentBot, taskTitle, onAssign }: { currentBot?: string; taskTitle: string; onAssign: (bot: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)}
        className="rounded-lg px-2 py-1 text-[11px] font-medium hover:opacity-80 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'var(--color-lavender)', color: 'var(--color-lavender-text)' }}>
        <UserPlus className="w-3 h-3" /> Assign
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 rounded-xl shadow-lg overflow-hidden min-w-[140px]"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          {ALL_BOTS.filter((b) => b !== currentBot).map((bot) => {
            const c = BOT_COLORS[bot] ?? BOT_COLORS.Adrian;
            return (
              <button key={bot} onClick={() => { onAssign(bot); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs font-medium hover:opacity-80 flex items-center gap-2 transition-all"
                style={{ color: 'var(--foreground)' }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.text }} />
                {bot}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Wellness Anchors ──────────────────────────────────────────────────────────
interface WellnessState {
  water: number;    // 0–8 glasses
  steps: number;    // 0–10 (thousands of steps)
  workout: boolean;
  prayer: boolean;
  journal: boolean;
}

const WELLNESS_DEFAULT: WellnessState = { water: 0, steps: 0, workout: false, prayer: false, journal: false };

function wellnessKey() { return `wellness-${new Date().toDateString()}`; }

function loadWellness(): WellnessState {
  if (typeof window === 'undefined') return WELLNESS_DEFAULT;
  try { const s = localStorage.getItem(wellnessKey()); return s ? { ...WELLNESS_DEFAULT, ...JSON.parse(s) } : WELLNESS_DEFAULT; } catch { return WELLNESS_DEFAULT; }
}

function saveWellness(s: WellnessState) {
  try { localStorage.setItem(wellnessKey(), JSON.stringify(s)); } catch { /**/ }
}

function WellnessAnchors() {
  const [w, setW] = useState<WellnessState>(WELLNESS_DEFAULT);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => { setW(loadWellness()); }, []);

  function update(patch: Partial<WellnessState>) {
    setW((prev) => {
      const next = { ...prev, ...patch };
      saveWellness(next);
      const allDone = next.water >= 8 && next.steps >= 10 && next.workout && next.prayer && next.journal;
      if (allDone) { setCelebrate(true); setTimeout(() => setCelebrate(false), 1800); }
      return next;
    });
  }

  const done = [w.water >= 8, w.steps >= 10, w.workout, w.prayer, w.journal].filter(Boolean).length;
  const pct = (done / 5) * 100;

  // SVG ring dimensions
  const r = 16; const circ = 2 * Math.PI * r;

  const anchors = [
    {
      key: 'water', label: 'Water', icon: Droplets,
      active: w.water >= 8, bg: 'var(--color-sky)', text: 'var(--color-sky-text)',
      sub: (
        <span className="flex gap-0.5 flex-wrap justify-center mt-0.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full transition-all"
              style={{ background: i < w.water ? 'var(--color-sky-text)' : 'var(--border)' }} />
          ))}
        </span>
      ),
      onTap: () => update({ water: w.water >= 8 ? 0 : w.water + 1 }),
    },
    {
      key: 'steps', label: 'Steps', icon: Footprints,
      active: w.steps >= 10, bg: 'var(--color-mint)', text: 'var(--color-mint-text)',
      sub: <span className="text-[9px]">{w.steps}k / 10k</span>,
      onTap: () => update({ steps: w.steps >= 10 ? 0 : w.steps + 1 }),
    },
    {
      key: 'workout', label: 'Move', icon: Dumbbell,
      active: w.workout, bg: 'var(--color-peach)', text: 'var(--color-peach-text)',
      sub: <span className="text-[9px]">{w.workout ? 'Done ✓' : 'Tap to log'}</span>,
      onTap: () => update({ workout: !w.workout }),
    },
    {
      key: 'prayer', label: 'Prayer', icon: Heart,
      active: w.prayer, bg: 'var(--color-lavender)', text: 'var(--color-lavender-text)',
      sub: <span className="text-[9px]">{w.prayer ? 'Done ✓' : 'Tap to log'}</span>,
      onTap: () => update({ prayer: !w.prayer }),
    },
    {
      key: 'journal', label: 'Journal', icon: BookOpen,
      active: w.journal, bg: 'var(--color-lemon)', text: 'var(--color-lemon-text)',
      sub: <span className="text-[9px]">{w.journal ? 'Done ✓' : 'Tap to log'}</span>,
      onTap: () => update({ journal: !w.journal }),
    },
  ];

  return (
    <div className="rounded-3xl border p-4 transition-all"
      style={{
        background: celebrate ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fde68a 100%)' : 'var(--card)',
        borderColor: celebrate ? '#F59E0B' : 'var(--border)',
      }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {/* SVG progress ring */}
          <svg width="40" height="40" viewBox="0 0 40 40" className="-rotate-90">
            <circle cx="20" cy="20" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle cx="20" cy="20" r={r} fill="none"
              stroke={done === 5 ? '#F59E0B' : 'var(--color-cyan)'}
              strokeWidth="3"
              strokeDasharray={circ}
              strokeDashoffset={circ - (circ * pct) / 100}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.4s ease' }}
            />
            <text x="20" y="20" textAnchor="middle" dominantBaseline="central"
              className="rotate-90" style={{ fontSize: 10, fontWeight: 700, fill: done === 5 ? '#B45309' : 'var(--foreground)', transform: 'rotate(90deg)', transformOrigin: '20px 20px' }}>
              {done}/5
            </text>
          </svg>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>Daily Anchors</p>
            <p className="text-[10px]" style={{ color: 'var(--muted-foreground)' }}>
              {done === 5 ? '🏆 All done — you\'re on fire!' : `${5 - done} left today`}
            </p>
          </div>
        </div>
        {celebrate && <span className="text-lg animate-bounce">🎉</span>}
      </div>
      <div className="grid grid-cols-5 gap-2">
        {anchors.map((a) => {
          const Icon = a.icon;
          return (
            <button key={a.key} onClick={a.onTap}
              className="flex flex-col items-center gap-1 rounded-2xl py-3 px-1 transition-all hover:scale-105 active:scale-95"
              style={{
                background: a.active ? a.bg : 'var(--muted)',
                border: `1.5px solid ${a.active ? a.text : 'transparent'}`,
                boxShadow: a.active ? `0 2px 8px rgba(0,0,0,0.08)` : 'none',
              }}>
              <Icon className="w-4 h-4" style={{ color: a.active ? a.text : 'var(--muted-foreground)' }} />
              <span className="text-[10px] font-semibold leading-tight"
                style={{ color: a.active ? a.text : 'var(--muted-foreground)' }}>{a.label}</span>
              <div style={{ color: a.active ? a.text : 'var(--muted-foreground)' }}>{a.sub}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Today-keyed localStorage helpers ─────────────────────────────────────────
function todayKey(suffix: string) {
  return `today-${new Date().toDateString()}-${suffix}`;
}
function loadTodayJSON<T>(suffix: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const s = localStorage.getItem(todayKey(suffix));
    return s ? JSON.parse(s) as T : fallback;
  } catch { return fallback; }
}
function saveTodayJSON(suffix: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(todayKey(suffix), JSON.stringify(value)); } catch { /**/ }
}

export default function TodayPage() {
  const { data, mutate } = useSWR<V2TodayFeed>('/api/v2/dashboard/today', fetcher, { refreshInterval: 30000 });
  const { data: calData } = useSWR<{ events: CalendarEvent[]; configured: boolean }>('/api/v2/calendar/events', fetcher, { refreshInterval: 60000 });
  const [streamStatus, setStreamStatus] = useState<'live' | 'fallback'>('fallback');
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dragOverEnd, setDragOverEnd] = useState(false);

  // Persisted across refreshes — keyed to today's date, auto-clears tomorrow
  const [droppedTasks, setDroppedTasksRaw] = useState<V2DashboardTimelineItem[]>([]);
  const [dismissedPriorityIds, setDismissedPriorityIdsRaw] = useState<Set<string>>(new Set());

  // Load from localStorage on mount
  useEffect(() => {
    setDroppedTasksRaw(loadTodayJSON<V2DashboardTimelineItem[]>('droppedTasks', []));
    setDismissedPriorityIdsRaw(new Set(loadTodayJSON<string[]>('dismissedIds', [])));
  }, []);

  // Wrapped setters that also persist
  const setDroppedTasks = useCallback((updater: ((prev: V2DashboardTimelineItem[]) => V2DashboardTimelineItem[]) | V2DashboardTimelineItem[]) => {
    setDroppedTasksRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveTodayJSON('droppedTasks', next);
      return next;
    });
  }, []);
  const setDismissedPriorityIds = useCallback((updater: ((prev: Set<string>) => Set<string>) | Set<string>) => {
    setDismissedPriorityIdsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveTodayJSON('dismissedIds', [...next]);
      return next;
    });
  }, []);

  const draggedItemRef = useRef<{ id: string; title: string; assignedBot: string; source: string } | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [completedTitles, setCompletedTitles] = useState<string[]>([]);
  const [showTrophy, setShowTrophy] = useState(false);
  const [gatewayPrefill, setGatewayPrefill] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const nowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stream = new EventSource('/api/v2/stream/dashboard');
    stream.addEventListener('connected', () => setStreamStatus('live'));
    stream.addEventListener('approval.updated', () => void mutate());
    stream.onerror = () => setStreamStatus('fallback');
    return () => stream.close();
  }, [mutate]);

  // Toast auto-hide
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(''), 2500);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const feed = data;
  const priorities = feed?.topPriorities ?? [];
  const availablePriorities = priorities.filter((p) => !dismissedPriorityIds.has(p.id)).slice(0, 10);
  const serverTimeline = feed?.timeline ?? [];

  // Apply completedIds overlay to server timeline
  const timeline = useMemo(() => {
    return serverTimeline.map((item) => {
      if (item.taskId && completedIds.has(item.taskId)) {
        return { ...item, status: 'done' as const, iconType: 'check' as const };
      }
      return item;
    });
  }, [serverTimeline, completedIds]);

  // Merge dropped tasks
  const taskTimeline = useMemo(() => {
    if (droppedTasks.length === 0) return timeline;
    return [...timeline, ...droppedTasks];
  }, [timeline, droppedTasks]);

  // ── Merge calendar events as underlay ──────────────────────────────────────
  const mergedTimeline = useMemo((): MergedItem[] => {
    const calEvents = calData?.events ?? [];
    const combined: MergedItem[] = [...taskTimeline];

    // Add calendar events not already in the timeline (dedup by title similarity)
    const taskTitles = new Set(taskTimeline.map((t) => t.title.toLowerCase()));
    for (const ev of calEvents) {
      if (!taskTitles.has(ev.title.toLowerCase())) {
        combined.push({
          _calEvent: true,
          id: ev.id,
          title: ev.title,
          startTime: ev.startTime,
          endTime: ev.endTime,
          startDate: ev.startDate,
          meetingUrl: ev.meetingUrl,
          location: ev.location,
          status: ev.status,
        });
      }
    }

    // Sort by startDate if available, otherwise keep original order
    combined.sort((a, b) => {
      const aDate = a._calEvent ? a.startDate : (a as V2DashboardTimelineItem).startDate;
      const bDate = b._calEvent ? b.startDate : (b as V2DashboardTimelineItem).startDate;
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return new Date(aDate).getTime() - new Date(bDate).getTime();
    });

    return combined;
  }, [taskTimeline, calData]);

  // Find NOW position in merged timeline
  const nowIndex = useMemo(() => {
    const now = Date.now();
    for (let i = 0; i < mergedTimeline.length; i++) {
      const item = mergedTimeline[i];
      const startDate = item._calEvent ? item.startDate : (item as V2DashboardTimelineItem).startDate;
      if (startDate && new Date(startDate).getTime() > now) return i;
    }
    return mergedTimeline.length;
  }, [mergedTimeline]);

  // Auto-scroll to now-line on load
  useEffect(() => {
    if (nowRef.current) nowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [nowIndex]);

  const greeting = useMemo(() => {
    if (!feed) return 'Loading...';
    return `${feed.userContext.greeting}, ${feed.userContext.userName}`;
  }, [feed]);

  const affirmation = feed?.userContext?.affirmation ?? '';

  // ── Done → Trophy ──
  const handleComplete = useCallback(async (taskId?: string) => {
    if (!taskId) return;
    setCompletedIds((prev) => new Set([...prev, taskId]));
    const title = mergedTimeline.find((t) => !t._calEvent && (t as V2DashboardTimelineItem).taskId === taskId)?.title ?? taskId;
    setCompletedTitles((prev) => [...prev, title]);
    setToastMsg(`✓ "${title}" added to Trophy Collection`);
    fetch(`/api/v2/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    }).catch(() => {});
    void mutate();
  }, [mutate, mergedTimeline]);

  // ── Undo Done (from Trophy) ──
  const handleUndoDone = useCallback((taskId: string) => {
    setCompletedIds((prev) => { const next = new Set(prev); next.delete(taskId); return next; });
    setCompletedTitles((prev) => {
      const title = mergedTimeline.find((t) => !t._calEvent && (t as V2DashboardTimelineItem).taskId === taskId)?.title;
      if (!title) return prev;
      const idx = prev.lastIndexOf(title);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
    setToastMsg('Task moved back to timeline');
  }, [mergedTimeline]);

  // ── Gateway → Pre-fill Kissin' Booth ──
  const handleGateway = useCallback((title: string) => {
    setGatewayPrefill(`Tell me about: ${title}`);
    setToastMsg('Message sent to Kissin\' Booth');
  }, []);

  // ── Bot badge → Telegram ──
  const handleBotTelegram = useCallback(async (botName: string, taskTitle: string) => {
    const botKey = BOT_TELEGRAM_KEY[botName] ?? 'bot2';
    try {
      await fetch('/api/telegram/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `📋 Task update: ${taskTitle}`, botKey }),
      });
      setToastMsg(`Message sent to ${botName} via Telegram`);
    } catch { setToastMsg(`Failed to reach ${botName}`); }
  }, []);

  // ── Assign To ──
  const handleAssign = useCallback(async (taskId: string, taskTitle: string, newBot: string) => {
    const botKey = BOT_TELEGRAM_KEY[newBot] ?? 'bot2';
    try {
      await fetch('/api/telegram/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `📌 New assignment: ${taskTitle}\nPlease pick this up.`, botKey }),
      });
      setToastMsg(`"${taskTitle}" assigned to ${newBot}`);
    } catch { setToastMsg('Assignment failed'); }
    void mutate();
  }, [mutate]);

  // ── Drag & Drop ──
  const handleDragStart = useCallback((item: typeof priorities[0]) => {
    draggedItemRef.current = { id: item.id, title: item.title, assignedBot: item.assignedBot, source: item.source };
  }, []);

  const handleDrop = useCallback((dropIdx: number) => {
    const dragged = draggedItemRef.current;
    if (!dragged) return;
    const refEntry = mergedTimeline[dropIdx];
    const refStartDate = refEntry && !refEntry._calEvent ? (refEntry as V2DashboardTimelineItem).startDate : refEntry?._calEvent ? (refEntry as { startDate: string }).startDate : undefined;
    const refTime = refEntry?._calEvent ? (refEntry as { startTime: string }).startTime : (refEntry as V2DashboardTimelineItem)?.time ?? 'TBD';
    const newEntry: V2DashboardTimelineItem = {
      time: refTime ?? 'TBD',
      title: dragged.title,
      type: 'task',
      status: 'upcoming',
      iconType: 'clock',
      assignedBot: dragged.assignedBot,
      taskId: dragged.id,
      startDate: refStartDate ?? undefined,
      endTime: undefined,
      meetingUrl: undefined,
    };
    setDroppedTasks((prev) => [...prev, newEntry]);
    setDismissedPriorityIds((prev) => new Set([...prev, dragged.id]));
    setDragOverIdx(null);
    setDragOverEnd(false);
    draggedItemRef.current = null;
    setToastMsg(`"${dragged.title}" added to timeline`);
  }, [mergedTimeline]);

  const handleDropEnd = useCallback(() => {
    const dragged = draggedItemRef.current;
    if (!dragged) return;
    // Far-future startDate ensures sort always places this after everything else
    const farFuture = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const newEntry: V2DashboardTimelineItem = {
      time: 'Later',
      title: dragged.title,
      type: 'task',
      status: 'upcoming',
      iconType: 'clock',
      assignedBot: dragged.assignedBot,
      taskId: dragged.id,
      startDate: farFuture,
      endTime: undefined,
      meetingUrl: undefined,
    };
    setDroppedTasks((prev) => [...prev, newEntry]);
    setDismissedPriorityIds((prev) => new Set([...prev, dragged.id]));
    setDragOverEnd(false);
    draggedItemRef.current = null;
    setToastMsg(`"${dragged.title}" added to end of timeline`);
  }, []);

  // ── Take Action ──
  const handleTakeAction = useCallback(async (item: typeof priorities[0]) => {
    try {
      const res = await fetch(item.actionWebhook, { method: 'POST' });
      if (res.ok) {
        setToastMsg(`Action taken: "${item.title}"`);
      } else {
        setToastMsg(`Action failed for "${item.title}"`);
      }
    } catch {
      setToastMsg(`Could not reach server for "${item.title}"`);
    }
    void mutate();
  }, [mutate]);

  return (
    <>
    {showTrophy && (
      <TrophyModal
        onClose={() => setShowTrophy(false)}
        localCompletions={completedTitles}
        completedIds={completedIds}
        onUndoTask={handleUndoDone}
      />
    )}

    {/* Toast notification */}
    {toastMsg && (
      <div className="fixed top-4 right-4 z-50 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-2"
        style={{ background: 'var(--color-mint)', color: 'var(--color-mint-text)', border: '1px solid rgba(0,0,0,0.06)' }}>
        {toastMsg}
      </div>
    )}

    <div className="space-y-4 md:space-y-6">
      {/* Greeting + Affirmation */}
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>{greeting}</h1>
        <p className="text-sm italic mt-1" style={{ color: 'var(--muted-foreground)' }}>
          {affirmation || 'You move with intention and grace.'}
        </p>
      </div>

      {/* ── Daily Anchors ── */}
      <WellnessAnchors />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        {/* ── Left: Today's Timeline ── */}
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" style={{ color: 'var(--color-cyan)' }} />
                <CardTitle>Today&apos;s Timeline</CardTitle>
              </div>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: streamStatus === 'live' ? 'var(--color-mint)' : 'var(--muted)', color: streamStatus === 'live' ? 'var(--color-mint-text)' : 'var(--muted-foreground)' }}>
                {streamStatus === 'live' ? 'Live' : 'Polling'}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {mergedTimeline.length === 0 && (
                <div className="rounded-xl border-2 border-dashed p-6 text-center" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No events yet — check back when calendar syncs</p>
                </div>
              )}

              {mergedTimeline.map((entry, idx) => {
                if (entry._calEvent) {
                  // ── Calendar event row ──
                  const calEntry = entry as { _calEvent: true; id: string; title: string; startTime: string; endTime: string | null; startDate: string; meetingUrl: string | null; location: string | null; status: 'done' | 'current' | 'upcoming' };
                  const isCurrent = calEntry.status === 'current';
                  const isDone = calEntry.status === 'done';
                  return (
                    <div
                      key={`cal-${calEntry.id}`}
                      onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                      onDragLeave={() => setDragOverIdx(null)}
                      onDrop={(e) => { e.preventDefault(); handleDrop(idx); }}
                    >
                      {idx === nowIndex && <div ref={nowRef}><NowLine /></div>}
                      {dragOverIdx === idx && (
                        <div className="h-1 rounded-full mx-2 mb-1" style={{ background: 'var(--color-cyan)', boxShadow: '0 0 8px rgba(0,217,255,0.5)' }} />
                      )}
                      <div className="rounded-xl p-3 transition-all group"
                        style={{
                          border: isCurrent ? '1.5px solid var(--color-sky-text)' : '1px solid var(--border)',
                          background: isCurrent ? 'var(--color-sky)' : 'var(--input-background)',
                          opacity: isDone ? 0.5 : 1,
                        }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-sm font-semibold w-16 flex-shrink-0" style={{ color: 'var(--color-sky-text)' }}>
                              {calEntry.startTime}
                            </span>
                            <div className="min-w-0">
                              <span className="text-sm block truncate" style={{ color: 'var(--foreground)', textDecoration: isDone ? 'line-through' : 'none' }}>
                                {calEntry.title}
                              </span>
                              {calEntry.endTime && (
                                <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                                  {calEntry.startTime} – {calEntry.endTime}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'var(--color-sky)', color: 'var(--color-sky-text)' }}>
                              Cal
                            </span>
                            {isCurrent && (
                              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}>Now</span>
                            )}
                            {calEntry.meetingUrl && !isDone && (
                              <a href={calEntry.meetingUrl} target="_blank" rel="noopener noreferrer"
                                className="rounded-lg p-1.5 transition-opacity hover:opacity-80"
                                style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}>
                                <Video className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                // ── Task / focus-block row ──
                const taskEntry = entry as V2DashboardTimelineItem;
                const isCurrent = taskEntry.status === 'current';
                const isDone = taskEntry.status === 'done';
                const isFocus = taskEntry.type === 'focus-block';
                const isTask = taskEntry.type === 'task';
                const botColors = taskEntry.assignedBot ? BOT_COLORS[taskEntry.assignedBot] : null;

                return (
                  <div key={`${taskEntry.time}-${taskEntry.title}-${idx}`}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                    onDragLeave={() => setDragOverIdx(null)}
                    onDrop={(e) => { e.preventDefault(); handleDrop(idx); }}>
                    {idx === nowIndex && <div ref={nowRef}><NowLine /></div>}
                    {dragOverIdx === idx && (
                      <div className="h-1 rounded-full mx-2 mb-1" style={{ background: 'var(--color-cyan)', boxShadow: '0 0 8px rgba(0,217,255,0.5)' }} />
                    )}
                    <div className="rounded-xl p-3 transition-all group"
                      style={{
                        border: isCurrent ? '1.5px solid var(--color-cyan)' : isFocus ? '1.5px dashed var(--color-purple)' : '1px solid var(--border)',
                        background: isCurrent ? 'rgba(0,217,255,0.06)' : isFocus ? 'rgba(123,104,238,0.04)' : 'var(--input-background)',
                        opacity: isDone ? 0.5 : 1,
                      }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-sm font-semibold w-16 flex-shrink-0"
                            style={{ color: isFocus ? 'var(--color-purple)' : 'var(--color-cyan)' }}>
                            {taskEntry.time}
                          </span>
                          <div className="min-w-0">
                            <span className="text-sm block truncate"
                              style={{ color: isFocus ? 'var(--color-purple)' : 'var(--foreground)', textDecoration: isDone ? 'line-through' : 'none', fontStyle: isFocus ? 'italic' : 'normal' }}>
                              {taskEntry.title}
                            </span>
                            {taskEntry.endTime && <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{taskEntry.time} – {taskEntry.endTime}</span>}
                          </div>
                        </div>
                        {!isDone && isCurrent && <Zap className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-cyan)' }} />}
                      </div>

                      {/* Action buttons row */}
                      {!isDone && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {isTask && (
                            <button onClick={() => handleComplete(taskEntry.taskId)}
                              className="rounded-lg px-2.5 py-1 text-[11px] font-medium hover:opacity-80 transition-opacity"
                              style={{ background: 'var(--color-mint)', color: 'var(--color-mint-text)' }}>
                              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Done</span>
                            </button>
                          )}
                          <button onClick={() => handleGateway(taskEntry.title)}
                            className="rounded-lg px-2.5 py-1 text-[11px] font-medium hover:opacity-80 transition-opacity opacity-0 group-hover:opacity-100"
                            style={{ background: 'var(--color-sky)', color: 'var(--color-sky-text)' }}>
                            <span className="flex items-center gap-1"><Send className="w-3 h-3" /> Gateway</span>
                          </button>
                          {taskEntry.assignedBot && botColors && (
                            <button onClick={() => handleBotTelegram(taskEntry.assignedBot!, taskEntry.title)}
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium hover:opacity-80 transition-opacity cursor-pointer"
                              style={{ background: botColors.bg, color: botColors.text }}
                              title={`Message ${taskEntry.assignedBot} on Telegram`}>
                              {taskEntry.assignedBot}
                            </button>
                          )}
                          {taskEntry.meetingUrl && (
                            <a href={taskEntry.meetingUrl} target="_blank" rel="noopener noreferrer"
                              className="rounded-lg px-2.5 py-1 text-[11px] font-medium hover:opacity-80 flex items-center gap-1"
                              style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}>
                              <Video className="w-3 h-3" /> Join
                            </a>
                          )}
                          {isTask && taskEntry.taskId && (
                            <AssignToDropdown currentBot={taskEntry.assignedBot} taskTitle={taskEntry.title}
                              onAssign={(bot) => handleAssign(taskEntry.taskId!, taskEntry.title, bot)} />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* NowLine at end when all entries are in the past */}
              {nowIndex >= mergedTimeline.length && mergedTimeline.length > 0 && (
                <div ref={nowRef}><NowLine /></div>
              )}

              {/* ── Drop zone below time bar ── */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOverEnd(true); }}
                onDragLeave={() => setDragOverEnd(false)}
                onDrop={(e) => { e.preventDefault(); handleDropEnd(); }}
                className="rounded-xl px-3 py-3 text-center text-[11px] transition-all"
                style={{
                  border: dragOverEnd ? '2px dashed var(--color-cyan)' : '2px dashed var(--border)',
                  background: dragOverEnd ? 'rgba(0,217,255,0.05)' : 'transparent',
                  color: dragOverEnd ? 'var(--color-cyan)' : 'var(--muted-foreground)',
                  marginTop: 4,
                }}
              >
                {dragOverEnd ? '📌 Drop to schedule later' : '↓ Drop here to add below current time'}
              </div>
            </div>
          </Card>

          {/* ── Top Priorities (drag source) ── */}
          <Card>
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4" style={{ color: 'var(--color-cyan)' }} />
              <CardTitle>Top Priorities</CardTitle>
            </div>
            <CardSubtitle>Drag into timeline to schedule · Click to take action</CardSubtitle>
            <div className="mt-3 space-y-2">
              {availablePriorities.map((item) => {
                const borderColor = BOT_BORDER[item.assignedBot] ?? BOT_BORDER.default;
                const botC = BOT_COLORS[item.assignedBot];
                return (
                  <div key={item.id}
                    draggable
                    onDragStart={() => handleDragStart(item)}
                    onDragEnd={() => { draggedItemRef.current = null; setDragOverIdx(null); setDragOverEnd(false); }}
                    className="flex items-center justify-between rounded-xl p-3 group cursor-grab active:cursor-grabbing"
                    style={{ border: '1px solid var(--border)', background: 'var(--input-background)', borderLeft: `3px solid ${borderColor}` }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <GripVertical className="w-3.5 h-3.5 flex-shrink-0 opacity-30 group-hover:opacity-70 transition-opacity" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{item.title}</p>
                          {item.dueAt && new Date(item.dueAt).getTime() < Date.now() && (
                            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold flex-shrink-0" style={{ background: 'rgba(255,92,92,0.15)', color: '#FF5C5C' }}>OVERDUE</span>
                          )}
                        </div>
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{item.source}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {botC && (
                        <button onClick={() => handleBotTelegram(item.assignedBot, item.title)}
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium hover:opacity-80 cursor-pointer"
                          style={{ background: botC.bg, color: botC.text }}
                          title={`Message ${item.assignedBot} on Telegram`}>
                          {item.assignedBot}
                        </button>
                      )}
                      {item.taskId && (
                        <AssignToDropdown currentBot={item.assignedBot} taskTitle={item.title}
                          onAssign={(bot) => handleAssign(item.taskId!, item.title, bot)} />
                      )}
                      <button className="rounded-full px-3 py-1.5 text-xs font-semibold hover:opacity-85"
                        style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
                        onClick={() => handleTakeAction(item)}>
                        Take Action
                      </button>
                    </div>
                  </div>
                );
              })}
              {availablePriorities.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>No priorities right now.</p>
              )}
            </div>
          </Card>
        </div>

        {/* ── Right: Live Ruby + Quick Actions ── */}
        <div className="space-y-4">
          <LiveRuby prefill={gatewayPrefill} onPrefillConsumed={() => setGatewayPrefill('')} />

          {/* Quick Actions */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--muted-foreground)' }}>Quick Actions</p>
            <div className="grid grid-cols-2 gap-3">
              <Link href="/tasks" className="rounded-2xl p-4 flex flex-col gap-2 transition-opacity hover:opacity-85" style={{ background: 'var(--color-lavender)', border: '1px solid rgba(0,0,0,0.04)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(123,104,238,0.2)' }}>
                  <Plus className="w-5 h-5" style={{ color: '#4A3DAA' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#0F1B35' }}>New Task</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-lavender-text)' }}>Create and assign work to any bot</p>
                </div>
              </Link>

              <Link href="/activity" className="rounded-2xl p-4 flex flex-col gap-2 transition-opacity hover:opacity-85" style={{ background: 'var(--color-sky)', border: '1px solid rgba(0,0,0,0.04)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,150,200,0.15)' }}>
                  <ListChecks className="w-5 h-5" style={{ color: 'var(--color-sky-text)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#0F1B35' }}>Approve Queue</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-sky-text)' }}>Clear all pending approvals</p>
                </div>
              </Link>

              <Link href="/email" className="rounded-2xl p-4 flex flex-col gap-2 transition-opacity hover:opacity-85" style={{ background: 'var(--color-mint)', border: '1px solid rgba(0,0,0,0.04)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,150,120,0.15)' }}>
                  <MessageSquare className="w-5 h-5" style={{ color: 'var(--color-mint-text)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#0F1B35' }}>Draft Reply</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-mint-text)' }}>Ruby writes your urgent response</p>
                </div>
              </Link>

              <button
                onClick={() => setShowTrophy(true)}
                className="rounded-2xl p-4 flex flex-col gap-2 text-left transition-opacity hover:opacity-85 relative"
                style={{ background: 'var(--color-lemon)', border: '1px solid rgba(0,0,0,0.04)' }}
              >
                {completedTitles.length > 0 && (
                  <span
                    className="absolute top-3 right-3 rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold"
                    style={{ background: '#B45309', color: '#FFFFFF' }}
                  >
                    {completedTitles.length}
                  </span>
                )}
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(180,83,9,0.15)' }}>
                  <Trophy className="w-5 h-5" style={{ color: '#B45309' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#0F1B35' }}>Trophy Collection</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-lemon-text)' }}>Daily wins &amp; completions</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}



