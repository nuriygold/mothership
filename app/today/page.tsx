'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Calendar, Star, CheckCircle2, Clock, Zap, Video,
  GripVertical, Target, Sparkles, Trophy, Plus,
  ListChecks, MessageSquare, X, Award,
} from 'lucide-react';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import { KissinBooth } from '@/components/today/kissin-booth';
import type { V2DashboardTimelineItem, V2TodayFeed } from '@/lib/v2/types';

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

// ── Now-line: shows current time with a horizontal rule ──
function NowLine() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);
  const label = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="relative flex items-center my-3" style={{ zIndex: 10 }}>
      {/* Time label floating just above the dot */}
      <span
        className="absolute -top-4 left-0 text-[10px] font-semibold"
        style={{ color: 'var(--color-cyan)' }}
      >
        {label}
      </span>
      {/* Dot on left (Google Calendar style) */}
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: 'var(--color-cyan)', boxShadow: '0 0 6px rgba(0,217,255,0.6)' }}
      />
      {/* Full-width thin line */}
      <div
        className="flex-1 h-px"
        style={{ background: 'var(--color-cyan)', opacity: 0.7 }}
      />
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
  // Track completed task IDs across BOTH server + dropped tasks
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [completedTitles, setCompletedTitles] = useState<string[]>([]);
  const [showTrophy, setShowTrophy] = useState(false);
  const nowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stream = new EventSource('/api/v2/stream/dashboard');
    stream.addEventListener('connected', () => setStreamStatus('live'));
    stream.addEventListener('approval.updated', () => void mutate());
    stream.onerror = () => setStreamStatus('fallback');
    return () => stream.close();
  }, [mutate]);

  // Auto-scroll to now-line on load
  useEffect(() => {
    if (nowRef.current) {
      nowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [data]);

  const feed = data;
  const priorities = feed?.topPriorities ?? [];
  const serverTimeline = feed?.timeline ?? [];

  // Merge server timeline + dropped tasks, with completedIds override
  const timeline = useMemo(() => {
    const merged = [...serverTimeline, ...droppedTasks].map((item) => {
      if (item.taskId && completedIds.has(item.taskId)) {
        return { ...item, status: 'done' as const, iconType: 'check' as const };
      }
      return item;
    });
    merged.sort((a, b) => {
      const aTime = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bTime = b.startDate ? new Date(b.startDate).getTime() : 0;
      return aTime - bTime;
    });
    return merged;
  }, [serverTimeline, droppedTasks, completedIds]);

  // Filter out priorities that were dropped into timeline
  const availablePriorities = useMemo(() => {
    const droppedIds = new Set(droppedTasks.map((t) => t.taskId).filter(Boolean));
    return priorities.filter((p) => !droppedIds.has(p.id));
  }, [priorities, droppedTasks]);

  // Find where "now" falls in the timeline
  const nowIndex = useMemo(() => {
    const now = Date.now();
    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i].startDate && new Date(timeline[i].startDate!).getTime() > now) {
        return i;
      }
    }
    return timeline.length;
  }, [timeline]);

  const greeting = useMemo(() => {
    if (!feed) return 'Loading...';
    return `${feed.userContext.greeting}, ${feed.userContext.userName}`;
  }, [feed]);

  const affirmation = feed?.userContext.affirmation ?? '';

  // Drag handlers for priority tasks
  const handleDragStart = useCallback((e: React.DragEvent, priorityId: string, title: string, source: string, bot: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: priorityId, title, source, bot }));
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    setDragOverIdx(null);
    try {
      const payload = JSON.parse(e.dataTransfer.getData('text/plain'));
      // Calculate time for this position
      const refItem = timeline[dropIdx];
      let dropTime: Date;
      if (refItem?.startDate) {
        dropTime = new Date(refItem.startDate);
        // Place 15 minutes before the reference item
        dropTime = new Date(dropTime.getTime() - 15 * 60000);
      } else {
        dropTime = new Date();
      }

      const newItem: V2DashboardTimelineItem = {
        time: dropTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        title: payload.title,
        iconType: 'spark',
        status: 'upcoming',
        type: 'task',
        taskId: payload.id,
        assignedBot: payload.bot,
        startDate: dropTime.toISOString(),
        isDraggable: true,
      };
      setDroppedTasks((prev) => [...prev, newItem]);

      // Fire the action webhook to mark as started
      fetch(`/api/v2/actions/${payload.id}/approve`, { method: 'POST' }).catch(() => {});
    } catch (_) {}
  }, [timeline]);

  const handleCompleteTask = useCallback(async (taskId?: string) => {
    if (!taskId) return;
    // Mark done in shared completedIds set — affects BOTH server and dropped items
    setCompletedIds((prev) => new Set([...prev, taskId]));
    // Track title for trophy collection
    const title = timeline.find((t) => t.taskId === taskId)?.title ?? taskId;
    setCompletedTitles((prev) => [...prev, title]);
    // Attempt to mark done via API (best effort)
    fetch(`/api/v2/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    }).catch(() => {});
    void mutate();
  }, [mutate]);

  return (
    <>
    {showTrophy && <TrophyModal onClose={() => setShowTrophy(false)} localCompletions={completedTitles} />}
    <div className="space-y-6">
      {/* Greeting + Affirmation */}
      <div>
        <h1 className="text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>{greeting}</h1>
        <p className="text-sm italic mt-1" style={{ color: 'var(--muted-foreground)' }}>
          {affirmation || 'You move with intention and grace.'}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.8fr_1fr]">
        <div className="space-y-4">

          {/* ── Today's Timeline ── */}
          <Card>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" style={{ color: 'var(--color-cyan)' }} />
                <CardTitle>Today&apos;s Timeline</CardTitle>
              </div>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  background: streamStatus === 'live' ? 'var(--color-mint)' : 'var(--muted)',
                  color: streamStatus === 'live' ? 'var(--color-mint-text)' : 'var(--muted-foreground)',
                }}
              >
                {streamStatus === 'live' ? 'Live' : 'Polling'}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {timeline.length === 0 && (
                <div
                  className="rounded-xl border-2 border-dashed p-6 text-center"
                  style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(0); }}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={(e) => handleDrop(e, 0)}
                >
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No events yet — drag tasks here or check back when calendar syncs</p>
                </div>
              )}

              {timeline.map((entry, idx) => (
                <div key={`${entry.time}-${entry.title}-${idx}`}>
                  {/* Insert NOW line at the right position */}
                  {idx === nowIndex && (
                    <div ref={nowRef}>
                      <NowLine />
                    </div>
                  )}
                  <TimelineEntry
                    entry={entry}
                    onComplete={entry.type === 'task' ? () => handleCompleteTask(entry.taskId) : undefined}
                    isDragOver={dragOverIdx === idx}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                    onDragLeave={() => setDragOverIdx(null)}
                    onDrop={(e) => handleDrop(e, idx)}
                  />
                </div>
              ))}
              {/* NOW line at the end if all items are past */}
              {nowIndex >= timeline.length && timeline.length > 0 && (
                <div ref={nowRef}>
                  <NowLine />
                </div>
              )}

              {/* Drop zone at bottom */}
              {timeline.length > 0 && (
                <div
                  className="rounded-xl border-2 border-dashed p-3 text-center text-xs transition-all"
                  style={{
                    borderColor: dragOverIdx === timeline.length ? 'var(--color-cyan)' : 'transparent',
                    color: 'var(--muted-foreground)',
                    opacity: dragOverIdx === timeline.length ? 1 : 0,
                  }}
                  onDragOver={(e) => { e.preventDefault(); setDragOverIdx(timeline.length); }}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={(e) => handleDrop(e, timeline.length)}
                >
                  Drop task here
                </div>
              )}
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
                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item.id, item.title, item.source, item.assignedBot)}
                    className="flex items-center justify-between rounded-xl p-3 cursor-grab active:cursor-grabbing transition-all hover:shadow-md"
                    style={{
                      border: '1px solid var(--border)',
                      background: 'var(--input-background)',
                      borderLeft: `3px solid ${borderColor}`,
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <GripVertical className="w-4 h-4 flex-shrink-0 opacity-30" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--foreground)' }}>{item.title}</p>
                        <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{item.source}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: 'var(--color-lavender)', color: 'var(--color-lavender-text)' }}
                      >
                        {item.assignedBot}
                      </span>
                      <button
                        className="rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-85"
                        style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          await fetch(item.actionWebhook, { method: 'POST' });
                          void mutate();
                        }}
                      >
                        Take Action
                      </button>
                    </div>
                  </div>
                );
              })}
              {availablePriorities.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
                  {droppedTasks.length > 0 ? 'All priorities scheduled in timeline.' : 'No high-priority tasks right now.'}
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">
          <KissinBooth />

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
