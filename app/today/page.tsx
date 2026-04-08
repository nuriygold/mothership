'use client';

import { type CSSProperties, type ElementType, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Calendar, Star, CheckCircle2, Zap, Video,
  GripVertical, Trophy, Plus,
  ListChecks, MessageSquare,
  Send,
} from 'lucide-react';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import { LiveRuby } from '@/components/today/live-ruby';
import { TrophyModal } from '@/components/today/trophy-modal';
import { NowLine } from '@/components/today/now-line';
import { AssignToDropdown } from '@/components/today/assign-to-dropdown';
import { WellnessAnchors } from '@/components/today/wellness-anchors';
import { TakeActionModal } from '@/components/today/take-action-modal';
import { BOT_TELEGRAM_KEY, BOT_COLORS, BOT_BORDER } from '@/lib/constants/today';
import type { V2DashboardTimelineItem, V2TodayFeed } from '@/lib/v2/types';
import type { CalendarEvent } from '@/lib/services/calendar';

type MergedItem =
  | (V2DashboardTimelineItem & { _calEvent?: false })
  | (Partial<CalendarEvent> & {
      _calEvent: true;
      id: string;
      title: string;
      startDate: string;
      startTime: string;
      endTime: string | null;
      status: 'done' | 'current' | 'upcoming';
    });

const fetcher = (url: string) => fetch(url).then((res) => res.json());

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

  const draggedItemRef = useRef<{ id: string; taskId?: string; title: string; assignedBot: string; source: string } | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [completedTitles, setCompletedTitles] = useState<string[]>([]);
  const [showTrophy, setShowTrophy] = useState(false);
  const [gatewayPrefill, setGatewayPrefill] = useState('');
  const [toastMsg, setToastMsg] = useState('');
  const [actionModalItem, setActionModalItem] = useState<V2DashboardPriorityItem | null>(null);
  const nowRef = useRef<HTMLDivElement>(null);

  // EventSource with retry (up to 3 attempts: 2s, 4s, 8s backoff)
  useEffect(() => {
    let attempts = 0;
    let stream: EventSource;
    function connect() {
      stream = new EventSource('/api/v2/stream/dashboard');
      stream.addEventListener('connected', () => { attempts = 0; setStreamStatus('live'); });
      stream.addEventListener('approval.updated', () => void mutate());
      stream.onerror = () => {
        stream.close();
        if (attempts < 3) {
          attempts++;
          setTimeout(connect, 2 ** attempts * 1000);
        } else {
          setStreamStatus('fallback');
        }
      };
    }
    connect();
    return () => stream?.close();
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
    fetch(`/api/v2/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'defer' }),
    }).catch(() => {});
    void mutate();
    setToastMsg('Task moved back to timeline');
  }, [mergedTimeline, mutate]);

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
    // Persist the assignment and notify the bot via Telegram in parallel
    await Promise.allSettled([
      fetch(`/api/v2/tasks/${taskId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign', ownerLogin: newBot }),
      }),
      fetch('/api/telegram/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `📌 New assignment: ${taskTitle}\nPlease pick this up.`, botKey }),
      }),
    ]);
    setToastMsg(`"${taskTitle}" assigned to ${newBot}`);
    void mutate();
  }, [mutate]);

  // ── Drag & Drop ──
  const handleDragStart = useCallback((item: typeof priorities[0]) => {
    draggedItemRef.current = { id: item.id, taskId: item.taskId, title: item.title, assignedBot: item.assignedBot, source: item.source };
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
      taskId: dragged.taskId,
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
      taskId: dragged.taskId,
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
  const handleTakeAction = useCallback((item: V2DashboardPriorityItem) => {
    setActionModalItem(item);
  }, []);

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

    {actionModalItem && (
      <TakeActionModal
        item={actionModalItem}
        onClose={() => setActionModalItem(null)}
        onDone={() => { void mutate(); }}
        onComplete={(taskId) => { void handleComplete(taskId); }}
        onGateway={(title) => { setGatewayPrefill(title); setActionModalItem(null); }}
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
              {!data ? (
                // Loading skeleton
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--muted)' }} />
                  ))}
                </div>
              ) : mergedTimeline.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed p-6 text-center" style={{ borderColor: 'var(--border)', color: 'var(--muted-foreground)' }}>
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No events yet — check back when calendar syncs</p>
                </div>
              ) : (
                <>
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
                </>
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
              {!data ? (
                // Loading skeleton
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 rounded-xl animate-pulse" style={{ background: 'var(--muted)' }} />
                  ))}
                </div>
              ) : availablePriorities.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>No priorities right now.</p>
              ) : (
                availablePriorities.map((item) => {
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
                })
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
