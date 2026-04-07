'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Calendar, Star, CheckCircle2, Clock, Zap, Video,
  GripVertical, Target, Sparkles, Trophy, Plus,
  ListChecks, MessageSquare, X, Award, ChevronDown,
  Send, UserPlus,
} from 'lucide-react';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import { KissinBooth } from '@/components/today/kissin-booth';
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

function TrophyModal({ onClose, localCompletions }: { onClose: () => void; localCompletions: string[] }) {
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
                {allTasks.map((task) => (
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
                  </div>
                ))}
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

// ── Google Calendar Panel ─────────────────────────────────────────────────────
function GoogleCalendarPanel() {
  const { data } = useSWR<{ events: CalendarEvent[]; configured: boolean }>('/api/v2/calendar/events', fetcher, { refreshInterval: 60000 });
  const events = data?.events ?? [];
  const configured = data?.configured ?? false;

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4" style={{ color: 'var(--color-sky-text)' }} />
        <CardTitle>Google Calendar</CardTitle>
      </div>
      <div className="mt-3 space-y-2">
        {!configured && (
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Add <code className="rounded bg-[var(--muted)] px-1 text-xs">GOOGLE_CLIENT_ID</code> to connect your calendar.
          </p>
        )}
        {configured && events.length === 0 && (
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>No events on your calendar today.</p>
        )}
        {events.map((ev) => {
          const isCurrent = ev.status === 'current';
          const isDone = ev.status === 'done';
          return (
            <div key={ev.id} className="flex items-center justify-between rounded-xl p-3 group"
              style={{
                border: isCurrent ? '1.5px solid var(--color-sky-text)' : '1px solid var(--border)',
                background: isCurrent ? 'var(--color-sky)' : 'var(--input-background)',
                opacity: isDone ? 0.5 : 1,
              }}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-semibold w-20 flex-shrink-0" style={{ color: 'var(--color-sky-text)' }}>{ev.startTime}</span>
                <div className="min-w-0">
                  <span className="text-sm block truncate" style={{ color: 'var(--foreground)', textDecoration: isDone ? 'line-through' : 'none' }}>{ev.title}</span>
                  {ev.endTime && <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{ev.startTime} – {ev.endTime}</span>}
                  {ev.location && <span className="text-[11px] block truncate" style={{ color: 'var(--muted-foreground)' }}>{ev.location}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {isCurrent && <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}>Now</span>}
                {ev.meetingUrl && !isDone && (
                  <a href={ev.meetingUrl} target="_blank" rel="noopener noreferrer"
                    className="rounded-lg px-2.5 py-1 text-[11px] font-medium hover:opacity-80 flex items-center gap-1"
                    style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
                    onClick={(e) => e.stopPropagation()}>
                    <Video className="w-3 h-3" /> Join
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
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

// ── Timeline entry row ──
function TimelineEntry({
  entry,
  onComplete,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  entry: V2DashboardTimelineItem;
  onComplete?: () => void;
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const isCurrent = entry.status === 'current';
  const isDone = entry.status === 'done';
  const isFocus = entry.type === 'focus-block';
  const isTask = entry.type === 'task';
  const Icon = TIMELINE_ICON_MAP[entry.iconType] ?? Clock;

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drop indicator */}
      {isDragOver && (
        <div className="h-1 rounded-full mx-4 mb-1 transition-all" style={{ background: 'var(--color-cyan)' }} />
      )}
      <div
        className="flex items-center justify-between rounded-xl p-3 transition-all group"
        style={{
          border: isCurrent ? '1.5px solid var(--color-cyan)' : isFocus ? '1.5px dashed var(--color-purple)' : '1px solid var(--border)',
          background: isCurrent
            ? 'rgba(0,217,255,0.06)'
            : isFocus
              ? 'rgba(123,104,238,0.04)'
              : 'var(--input-background)',
          opacity: isDone ? 0.5 : 1,
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Time */}
          <span
            className="text-sm font-semibold w-20 flex-shrink-0"
            style={{ color: isFocus ? 'var(--color-purple)' : 'var(--color-cyan)' }}
          >
            {entry.time}
          </span>

          {/* Icon */}
          <Icon
            className="w-4 h-4 flex-shrink-0"
            style={{
              color: isDone
                ? 'var(--color-cyan)'
                : isFocus
                  ? 'var(--color-purple)'
                  : isCurrent
                    ? 'var(--color-cyan)'
                    : 'var(--muted-foreground)',
              opacity: isDone ? 0.6 : 1,
            }}
          />

          {/* Title + metadata */}
          <div className="min-w-0">
            <span
              className="text-sm block truncate"
              style={{
                color: isFocus ? 'var(--color-purple)' : 'var(--foreground)',
                fontStyle: isFocus ? 'italic' : 'normal',
                textDecoration: isDone ? 'line-through' : 'none',
              }}
            >
              {entry.title}
            </span>
            {entry.endTime && (
              <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>
                {entry.time} – {entry.endTime}
              </span>
            )}
          </div>
        </div>

        {/* Right side: type badge + actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Type badge */}
          {entry.type === 'calendar' && !isDone && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: 'var(--color-sky)', color: 'var(--color-sky-text)' }}
            >
              Cal
            </span>
          )}
          {isTask && entry.assignedBot && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: 'var(--color-lavender)', color: 'var(--color-lavender-text)' }}
            >
              {entry.assignedBot}
            </span>
          )}

          {/* Meeting link */}
          {entry.meetingUrl && !isDone && (
            <a
              href={entry.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-1.5 transition-opacity hover:opacity-80"
              style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
              onClick={(e) => e.stopPropagation()}
            >
              <Video className="w-3.5 h-3.5" />
            </a>
          )}

          {/* Complete action for tasks */}
          {isTask && !isDone && onComplete && (
            <button
              onClick={onComplete}
              className="rounded-lg px-2.5 py-1 text-[11px] font-medium transition-opacity hover:opacity-80 opacity-0 group-hover:opacity-100"
              style={{ background: 'var(--color-mint)', color: 'var(--color-mint-text)' }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TodayPage() {
  const { data, mutate } = useSWR<V2TodayFeed>('/api/v2/dashboard/today', fetcher, { refreshInterval: 30000 });
  const [streamStatus, setStreamStatus] = useState<'live' | 'fallback'>('fallback');
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [droppedTasks, setDroppedTasks] = useState<V2DashboardTimelineItem[]>([]);
  const [dismissedPriorityIds, setDismissedPriorityIds] = useState<Set<string>>(new Set());
  const draggedItemRef = useRef<{ id: string; title: string; assignedBot: string; source: string } | null>(null);
  // Track completed task IDs across BOTH server + dropped tasks
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
  // Remove dragged-to-timeline items; always show up to 10
  const availablePriorities = priorities.filter((p) => !dismissedPriorityIds.has(p.id)).slice(0, 10);
  const serverTimeline = feed?.timeline ?? [];

  // Apply completedIds overlay
  const timeline = useMemo(() => {
    return serverTimeline.map((item) => {
      if (item.taskId && completedIds.has(item.taskId)) {
        return { ...item, status: 'done' as const, iconType: 'check' as const };
      }
      return item;
    });
  }, [serverTimeline, completedIds]);

  const mergedTimeline = useMemo(() => {
    if (droppedTasks.length === 0) return timeline;
    return [...timeline, ...droppedTasks];
  }, [timeline, droppedTasks]);

  // Find NOW position in timeline
  const nowIndex = useMemo(() => {
    const now = Date.now();
    for (let i = 0; i < mergedTimeline.length; i++) {
      if (mergedTimeline[i].startDate && new Date(mergedTimeline[i].startDate!).getTime() > now) return i;
    }
    return mergedTimeline.length;
  }, [mergedTimeline]);

  // Auto-scroll to now-line on load (fires after nowIndex is computed)
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
    const title = mergedTimeline.find((t) => t.taskId === taskId)?.title ?? taskId;
    setCompletedTitles((prev) => [...prev, title]);
    setToastMsg(`✓ "${title}" added to Trophy Collection`);
    fetch(`/api/v2/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    }).catch(() => {});
    void mutate();
  }, [mutate, mergedTimeline]);

  // ── Undo Done ──
  const handleUndoDone = useCallback((taskId?: string) => {
    if (!taskId) return;
    setCompletedIds((prev) => { const next = new Set(prev); next.delete(taskId); return next; });
    setToastMsg('Task marked as not done');
  }, []);

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

  // ── Assign To → Reassign bot ──
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
    const refEntry = mergedTimeline[dropIdx] ?? mergedTimeline[mergedTimeline.length - 1];
    const newEntry: V2DashboardTimelineItem = {
      time: refEntry?.time ?? 'TBD',
      title: dragged.title,
      type: 'task',
      status: 'upcoming',
      iconType: 'clock',
      assignedBot: dragged.assignedBot,
      taskId: dragged.id,
      startDate: refEntry?.startDate ?? undefined,
      endTime: undefined,
      meetingUrl: undefined,
    };
    setDroppedTasks((prev) => [...prev, newEntry]);
    setDismissedPriorityIds((prev) => new Set([...prev, dragged.id]));
    setDragOverIdx(null);
    draggedItemRef.current = null;
    setToastMsg(`"${dragged.title}" added to timeline`);
  }, [mergedTimeline]);

  // ── Take Action with visible feedback ──
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
    {showTrophy && <TrophyModal onClose={() => setShowTrophy(false)} localCompletions={completedTitles} />}

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

      <div className="grid gap-4 grid-cols-1 xl:grid-cols-[1fr_1fr_1fr]">
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
                const isCurrent = entry.status === 'current';
                const isDone = entry.status === 'done';
                const isFocus = entry.type === 'focus-block';
                const isTask = entry.type === 'task';
                const botColors = entry.assignedBot ? BOT_COLORS[entry.assignedBot] : null;
                return (
                  <div key={`${entry.time}-${entry.title}-${idx}`}
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
                            {entry.time}
                          </span>
                          <div className="min-w-0">
                            <span className="text-sm block truncate"
                              style={{ color: isFocus ? 'var(--color-purple)' : 'var(--foreground)', textDecoration: isDone ? 'line-through' : 'none', fontStyle: isFocus ? 'italic' : 'normal' }}>
                              {entry.title}
                            </span>
                            {entry.endTime && <span className="text-[11px]" style={{ color: 'var(--muted-foreground)' }}>{entry.time} – {entry.endTime}</span>}
                          </div>
                        </div>
                        {isDone && (
                          <button onClick={() => handleUndoDone(entry.taskId)}
                            className="rounded-lg px-2 py-1 text-[10px] font-medium hover:opacity-80 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
                            title="Mark as not done">
                            Undo
                          </button>
                        )}
                        {!isDone && isCurrent && <Zap className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--color-cyan)' }} />}
                      </div>

                      {/* ── Action buttons row ── */}
                      {!isDone && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {/* Done button */}
                          {isTask && (
                            <button onClick={() => handleComplete(entry.taskId)}
                              className="rounded-lg px-2.5 py-1 text-[11px] font-medium hover:opacity-80 transition-opacity"
                              style={{ background: 'var(--color-mint)', color: 'var(--color-mint-text)' }}>
                              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Done</span>
                            </button>
                          )}

                          {/* Gateway button */}
                          <button onClick={() => handleGateway(entry.title)}
                            className="rounded-lg px-2.5 py-1 text-[11px] font-medium hover:opacity-80 transition-opacity opacity-0 group-hover:opacity-100"
                            style={{ background: 'var(--color-sky)', color: 'var(--color-sky-text)' }}>
                            <span className="flex items-center gap-1"><Send className="w-3 h-3" /> Gateway</span>
                          </button>

                          {/* Bot badge → Telegram */}
                          {entry.assignedBot && botColors && (
                            <button onClick={() => handleBotTelegram(entry.assignedBot!, entry.title)}
                              className="rounded-full px-2 py-0.5 text-[10px] font-medium hover:opacity-80 transition-opacity cursor-pointer"
                              style={{ background: botColors.bg, color: botColors.text }}
                              title={`Message ${entry.assignedBot} on Telegram`}>
                              {entry.assignedBot}
                            </button>
                          )}

                          {/* Meeting link */}
                          {entry.meetingUrl && (
                            <a href={entry.meetingUrl} target="_blank" rel="noopener noreferrer"
                              className="rounded-lg px-2.5 py-1 text-[11px] font-medium hover:opacity-80 flex items-center gap-1"
                              style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}>
                              <Video className="w-3 h-3" /> Join
                            </a>
                          )}

                          {/* Assign To */}
                          {isTask && entry.taskId && (
                            <AssignToDropdown currentBot={entry.assignedBot} taskTitle={entry.title}
                              onAssign={(bot) => handleAssign(entry.taskId!, entry.title, bot)} />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {nowIndex >= mergedTimeline.length && mergedTimeline.length > 0 && <div ref={nowRef}><NowLine /></div>}
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
                    onDragEnd={() => { draggedItemRef.current = null; setDragOverIdx(null); }}
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

        {/* ── Center: Google Calendar ── */}
        <div className="space-y-4">
          <GoogleCalendarPanel />
        </div>

        {/* ── Right: Kissin' Booth + Quick Actions ── */}
        <div className="space-y-4">
          <KissinBooth />


          {/* Quick Actions */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--muted-foreground)' }}>Quick Actions</p>
            <div className="grid grid-cols-2 gap-3">
              {/* New Task */}
              <Link href="/tasks" className="rounded-2xl p-4 flex flex-col gap-2 transition-opacity hover:opacity-85" style={{ background: 'var(--color-lavender)', border: '1px solid rgba(0,0,0,0.04)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(123,104,238,0.2)' }}>
                  <Plus className="w-5 h-5" style={{ color: '#4A3DAA' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#0F1B35' }}>New Task</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-lavender-text)' }}>Create and assign work to any bot</p>
                </div>
              </Link>

              {/* Approve Queue */}
              <Link href="/activity" className="rounded-2xl p-4 flex flex-col gap-2 transition-opacity hover:opacity-85" style={{ background: 'var(--color-sky)', border: '1px solid rgba(0,0,0,0.04)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,150,200,0.15)' }}>
                  <ListChecks className="w-5 h-5" style={{ color: 'var(--color-sky-text)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#0F1B35' }}>Approve Queue</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-sky-text)' }}>Clear all pending approvals</p>
                </div>
              </Link>

              {/* Draft Reply */}
              <Link href="/email" className="rounded-2xl p-4 flex flex-col gap-2 transition-opacity hover:opacity-85" style={{ background: 'var(--color-mint)', border: '1px solid rgba(0,0,0,0.04)' }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,150,120,0.15)' }}>
                  <MessageSquare className="w-5 h-5" style={{ color: 'var(--color-mint-text)' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#0F1B35' }}>Draft Reply</p>
                  <p className="text-[11px]" style={{ color: 'var(--color-mint-text)' }}>Ruby writes your urgent response</p>
                </div>
              </Link>

              {/* Trophy Collection */}
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
