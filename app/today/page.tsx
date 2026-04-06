'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Calendar, Star, CheckCircle2, Clock, Zap, Video,
  GripVertical, Target, Sparkles, ExternalLink,
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

// ── Now-line: shows current time with a horizontal rule ──
function NowLine() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);
  const label = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="relative flex items-center gap-3 my-1">
      <span
        className="text-[11px] font-bold flex-shrink-0 px-2 py-0.5 rounded-full"
        style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
      >
        NOW · {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'var(--color-cyan)' }} />
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: 'var(--color-cyan)', boxShadow: '0 0 8px rgba(0,217,255,0.5)' }}
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
    // Attempt to mark done via API (best effort)
    fetch(`/api/v2/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    }).catch(() => {});
    void mutate();
  }, [mutate]);

  return (
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
          <Card>
            <CardTitle>Quick Actions</CardTitle>
            <div className="mt-3 grid gap-2 grid-cols-2">
              {[
                { label: 'New Task', href: '/tasks' },
                { label: 'Approve Queue', href: '/activity' },
                { label: 'Draft Reply', href: '/email' },
                { label: 'Finance', href: '/finance' },
              ].map(({ label, href }) => (
                <Link
                  key={href}
                  href={href as any}
                  className="rounded-xl border px-3 py-2 text-sm text-center transition-all hover:opacity-80"
                  style={{ borderColor: 'var(--border)', background: 'var(--input-background)', color: 'var(--foreground)' }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
