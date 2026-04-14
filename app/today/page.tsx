'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Calendar, Star, CheckCircle2, Zap, Video,
  Trophy, Plus,
  ListChecks, MessageSquare,
  Send, Sparkles, Rocket,
} from 'lucide-react';
import { Card, CardSubtitle, CardTitle } from '@/components/ui/card';
import { TrophyModal } from '@/components/today/trophy-modal';
import { NowLine } from '@/components/today/now-line';
import { TakeActionModal } from '@/components/today/take-action-modal';
import { AssignToDropdown } from '@/components/today/assign-to-dropdown';
import { WellnessAnchors } from '@/components/today/wellness-anchors';
import { JarvisCard } from '@/components/voice/jarvis-card';
import { BOT_TELEGRAM_KEY, BOT_COLORS, BOT_BORDER, BOT_OWNER_LOGIN, normalizeBotName } from '@/lib/constants/today';
import type { V2DashboardPriorityItem, V2DashboardTimelineItem, V2TodayFeed, V2TaskItem, V2TasksFeed } from '@/lib/v2/types';
import type { CalendarEvent } from '@/lib/services/calendar';
import { TaskCard } from '@/components/tasks/task-card';

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

function logTodayClientFailure(action: string, error: unknown, metadata?: Record<string, unknown>) {
  console.error(JSON.stringify({
    scope: 'today_page',
    action,
    error: error instanceof Error ? error.message : String(error),
    metadata: metadata ?? {},
    timestamp: new Date().toISOString(),
  }));
}



/** Convert a V2TaskItem into the shape TakeActionModal expects. */
function toActionItem(task: V2TaskItem): V2DashboardPriorityItem {
  return {
    id: task.taskId,
    taskId: task.taskId,
    title: task.title,
    source: task.metadata.department,
    actionWebhook: `/api/v2/tasks/${task.taskId}`,
    assignedBot: task.metadata.assignedBot,
    dueAt: task.metadata.dueAtISO,
  };
}

export default function TodayPage() {
  const { data, mutate } = useSWR<V2TodayFeed>('/api/v2/dashboard/today', fetcher, { refreshInterval: 30000 });
  const { data: calData } = useSWR<{ events: CalendarEvent[]; configured: boolean }>('/api/v2/calendar/events', fetcher, { refreshInterval: 60000 });
  const { data: tasksData } = useSWR<V2TasksFeed>('/api/v2/tasks', fetcher, { refreshInterval: 30000 });
  const [streamStatus, setStreamStatus] = useState<'live' | 'fallback'>('fallback');
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [completedTitles, setCompletedTitles] = useState<string[]>([]);
  const [showTrophy, setShowTrophy] = useState(false);
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

  // ── Merge calendar events as underlay ──────────────────────────────────────
  const mergedTimeline = useMemo((): MergedItem[] => {
    const calEvents = calData?.events ?? [];
    const combined: MergedItem[] = [...timeline];

    // Add calendar events not already in the timeline (dedup by title similarity)
    const taskTitles = new Set(timeline.map((t) => t.title.toLowerCase()));
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
  }, [timeline, calData]);

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
    const title = mergedTimeline.find((t) => !t._calEvent && (t as V2DashboardTimelineItem).taskId === taskId)?.title ?? taskId;
    setCompletedIds((prev) => new Set([...prev, taskId]));
    setCompletedTitles((prev) => [...prev, title]);
    try {
      const res = await fetch(`/api/v2/tasks/${taskId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });
      if (!res.ok) throw new Error(`Task complete failed (${res.status})`);
      setToastMsg(`✓ "${title}" added to Trophy Collection`);
      await mutate();
    } catch (error) {
      setCompletedIds((prev) => {
        const next = new Set(prev);
        next.delete(taskId);
        return next;
      });
      setCompletedTitles((prev) => {
        const idx = prev.lastIndexOf(title);
        if (idx === -1) return prev;
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
      setToastMsg(`Couldn't complete "${title}"`);
      logTodayClientFailure('task_complete', error, { taskId });
    }
  }, [mutate, mergedTimeline]);

  // ── Undo Done (from Trophy) ──
  const handleUndoDone = useCallback(async (taskId: string) => {
    const title = mergedTimeline.find((t) => !t._calEvent && (t as V2DashboardTimelineItem).taskId === taskId)?.title ?? taskId;
    setCompletedIds((prev) => { const next = new Set(prev); next.delete(taskId); return next; });
    setCompletedTitles((prev) => {
      const idx = prev.lastIndexOf(title);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
    try {
      const res = await fetch(`/api/v2/tasks/${taskId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'defer' }),
      });
      if (!res.ok) throw new Error(`Task defer failed (${res.status})`);
      await mutate();
      setToastMsg('Task moved back to timeline');
    } catch (error) {
      setCompletedIds((prev) => new Set([...prev, taskId]));
      setCompletedTitles((prev) => [...prev, title]);
      setToastMsg(`Couldn't defer "${title}"`);
      logTodayClientFailure('task_defer', error, { taskId });
    }
  }, [mergedTimeline, mutate]);

  // ── Gateway → Navigate to Ruby ──
  const handleGateway = useCallback((title: string) => {
    const params = new URLSearchParams({ q: title });
    window.location.href = `/ruby?${params.toString()}`;
  }, []);


  // ── Dispatch This → Navigate to /dispatch with task pre-filled ──
  const handleDispatch = useCallback((item: V2DashboardPriorityItem) => {
    const params = new URLSearchParams({ task: item.title, source: item.source });
    window.location.href = `/dispatch?${params.toString()}`;
  }, []);

  // ── Anchor all-complete → add to Trophy ──
  const handleAnchorAllComplete = useCallback(() => {
    const label = '🏆 Daily Anchors Complete';
    setCompletedTitles((prev) => {
      if (prev.includes(label)) return prev;
      return [...prev, label];
    });
    setToastMsg('🏆 All Daily Anchors done — added to Trophy Collection!');
  }, []);

  // ── Bot badge → Telegram ──
  const handleBotTelegram = useCallback(async (botName: string, taskTitle: string) => {
    const normalizedBot = normalizeBotName(botName);
    const botKey = BOT_TELEGRAM_KEY[normalizedBot] ?? BOT_TELEGRAM_KEY[botName] ?? 'bot2';
    try {
      await fetch('/api/telegram/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `📋 Task update: ${taskTitle}`, botKey }),
      });
      setToastMsg(`Message sent to ${normalizedBot} via Telegram`);
    } catch (error) {
      setToastMsg(`Failed to reach ${normalizedBot}`);
      logTodayClientFailure('telegram_send', error, { botName: normalizedBot });
    }
  }, []);

  // ── Assign To ──
  const handleAssign = useCallback(async (taskId: string, taskTitle: string, newBot: string) => {
    const normalizedBot = normalizeBotName(newBot);
    const ownerLogin = BOT_OWNER_LOGIN[normalizedBot];
    if (!ownerLogin) {
      setToastMsg(`Couldn't assign "${taskTitle}" to ${normalizedBot}`);
      logTodayClientFailure('task_assign', new Error('Unknown bot owner login mapping'), { taskId, botName: normalizedBot });
      return;
    }
    const botKey = BOT_TELEGRAM_KEY[normalizedBot] ?? BOT_TELEGRAM_KEY[newBot] ?? 'bot2';
    try {
      const [assignRes, telegramRes] = await Promise.all([
        fetch(`/api/v2/tasks/${taskId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'assign', ownerLogin }),
        }),
        fetch('/api/telegram/send', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `📌 New assignment: ${taskTitle}\nPlease pick this up.`, botKey }),
        }),
      ]);
      if (!assignRes.ok) throw new Error(`Assignment failed (${assignRes.status})`);
      const payload = await assignRes.json().catch(() => ({} as AssignTaskResponse));
      await mutate();
      if (telegramRes.ok) {
        setToastMsg(`"${taskTitle}" assigned to ${payload.assigned ?? normalizedBot}`);
      } else {
        setToastMsg(`"${taskTitle}" assigned to ${payload.assigned ?? normalizedBot} (Telegram notify failed)`);
        logTodayClientFailure('assignment_telegram', new Error(`Telegram notify failed (${telegramRes.status})`), { taskId, botName: normalizedBot });
      }
    } catch (error) {
      setToastMsg(`Couldn't assign "${taskTitle}" to ${normalizedBot}`);
      logTodayClientFailure('task_assign', error, { taskId, botName: normalizedBot, ownerLogin });
    }
  }, [mutate]);


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
        onComplete={handleComplete}
        onGateway={(title) => { handleGateway(title); setActionModalItem(null); }}
        onDispatch={(item) => { handleDispatch(item); }}
        onAddToVisionBoard={async (taskId) => {
          const res = await fetch(`/api/v2/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'vision_board' }),
          });
          if (!res.ok) throw new Error(`Vision board label failed (${res.status})`);
        }}
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
      <WellnessAnchors onAllComplete={handleAnchorAllComplete} />

      <div className="grid gap-4 max-sm:mx-3 md:grid-cols-2">
        {/* ── Left: Today's Timeline ── */}
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
                    const prevEntry = idx > 0 ? mergedTimeline[idx - 1] : null;
                    const prevTime = prevEntry
                      ? (prevEntry._calEvent ? (prevEntry as { startTime: string }).startTime : (prevEntry as V2DashboardTimelineItem).time)
                      : null;
                    const thisTime = entry._calEvent
                      ? (entry as { startTime: string }).startTime
                      : (entry as V2DashboardTimelineItem).time;
                    const showTime = thisTime !== prevTime;

                    if (entry._calEvent) {
                      // ── Calendar event row ──
                      const calEntry = entry as { _calEvent: true; id: string; title: string; startTime: string; endTime: string | null; startDate: string; meetingUrl: string | null; location: string | null; status: 'done' | 'current' | 'upcoming' };
                      const isCurrent = calEntry.status === 'current';
                      const isDone = calEntry.status === 'done';
                      return (
                        <div key={`cal-${calEntry.id}`}>
                          {idx === nowIndex && <div ref={nowRef}><NowLine /></div>}
                          <div className="rounded-xl p-3 transition-all group"
                            style={{
                              border: isCurrent ? '1.5px solid var(--color-sky-text)' : '1px solid var(--border)',
                              background: isCurrent ? 'var(--color-sky)' : 'var(--input-background)',
                              opacity: isDone ? 0.5 : 1,
                            }}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-sm font-semibold w-16 flex-shrink-0" style={{ color: 'var(--color-sky-text)', opacity: showTime ? 1 : 0 }}>
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
                    const normalizedTaskBot = taskEntry.assignedBot ? normalizeBotName(taskEntry.assignedBot) : '';
                    const botColors = normalizedTaskBot ? BOT_COLORS[normalizedTaskBot] : null;

                    return (
                      <div key={`${taskEntry.time}-${taskEntry.title}-${idx}`}>
                        {idx === nowIndex && <div ref={nowRef}><NowLine /></div>}
                        <div className="rounded-xl p-3 transition-all group"
                          style={{
                            border: isCurrent ? '1.5px solid var(--color-cyan)' : isFocus ? '1.5px dashed var(--color-purple)' : '1px solid var(--border)',
                            background: isCurrent ? 'rgba(0,217,255,0.06)' : isFocus ? 'rgba(123,104,238,0.04)' : 'var(--input-background)',
                            opacity: isDone ? 0.5 : 1,
                          }}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-sm font-semibold w-16 flex-shrink-0"
                                style={{ color: isFocus ? 'var(--color-purple)' : 'var(--color-cyan)', opacity: showTime ? 1 : 0 }}>
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
                                <span className="flex items-center gap-1"><Send className="w-3 h-3" /> Ask Ruby</span>
                              </button>
                              {taskEntry.assignedBot && botColors && (
                                <button onClick={() => handleBotTelegram(normalizedTaskBot, taskEntry.title)}
                                  className="rounded-full px-2 py-0.5 text-[10px] font-medium hover:opacity-80 transition-opacity cursor-pointer"
                                  style={{ background: botColors.bg, color: botColors.text }}
                                  title={`Message ${normalizedTaskBot} on Telegram`}>
                                  {normalizedTaskBot}
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
                                <AssignToDropdown currentBot={normalizedTaskBot || taskEntry.assignedBot} taskTitle={taskEntry.title}
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

            </div>
          </Card>

        {/* ── Right: Active Tasks ── */}
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4" style={{ color: 'var(--color-cyan)' }} />
              <CardTitle>Active Tasks</CardTitle>
            </div>
            {tasksData && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}>
                {tasksData.active.length}
              </span>
            )}
          </div>
          <div className="mt-3 space-y-2">
            {!tasksData ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: 'var(--muted)' }} />
                ))}
              </div>
            ) : tasksData.active.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>No active tasks right now.</p>
            ) : (
              tasksData.active.map((task) => (
                <TaskCard
                  key={task.taskId}
                  task={task}
                  onTakeAction={(t) => handleTakeAction(toActionItem(t))}
                />
              ))
            )}
          </div>
        </Card>
      </div>

      {/* ── Quick Actions ── */}
      <Card className="max-sm:mx-3">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4" style={{ color: 'var(--color-cyan)' }} />
          <CardTitle>Quick Actions</CardTitle>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Link href="/tasks" className="rounded-xl flex flex-col items-center justify-center gap-1.5 py-4 transition-opacity hover:opacity-80 active:scale-95"
            style={{ background: 'rgba(0,217,255,0.08)', border: '1px solid rgba(0,217,255,0.18)' }}>
            <Plus className="w-5 h-5" style={{ color: 'var(--color-cyan)' }} />
            <span className="text-xs font-semibold text-center leading-tight" style={{ color: 'var(--foreground)' }}>New Task</span>
          </Link>
          <Link href="/activity" className="rounded-xl flex flex-col items-center justify-center gap-1.5 py-4 transition-opacity hover:opacity-80 active:scale-95"
            style={{ background: 'rgba(0,217,255,0.08)', border: '1px solid rgba(0,217,255,0.18)' }}>
            <ListChecks className="w-5 h-5" style={{ color: 'var(--color-cyan)' }} />
            <span className="text-xs font-semibold text-center leading-tight" style={{ color: 'var(--foreground)' }}>Approve Queue</span>
          </Link>
          <Link href="/ruby" className="rounded-xl flex flex-col items-center justify-center gap-1.5 py-4 transition-opacity hover:opacity-80 active:scale-95"
            style={{ background: 'rgba(0,217,255,0.08)', border: '1px solid rgba(0,217,255,0.18)' }}>
            <Sparkles className="w-5 h-5" style={{ color: 'var(--color-cyan)' }} />
            <span className="text-xs font-semibold text-center leading-tight" style={{ color: 'var(--foreground)' }}>Ask Ruby</span>
          </Link>
          <Link href="/dispatch" className="rounded-xl flex flex-col items-center justify-center gap-1.5 py-4 transition-opacity hover:opacity-80 active:scale-95"
            style={{ background: 'rgba(0,217,255,0.08)', border: '1px solid rgba(0,217,255,0.18)' }}>
            <Rocket className="w-5 h-5" style={{ color: 'var(--color-cyan)' }} />
            <span className="text-xs font-semibold text-center leading-tight" style={{ color: 'var(--foreground)' }}>Dispatch</span>
          </Link>
          <Link href="/email" className="rounded-xl flex flex-col items-center justify-center gap-1.5 py-4 transition-opacity hover:opacity-80 active:scale-95"
            style={{ background: 'rgba(0,217,255,0.08)', border: '1px solid rgba(0,217,255,0.18)' }}>
            <MessageSquare className="w-5 h-5" style={{ color: 'var(--color-cyan)' }} />
            <span className="text-xs font-semibold text-center leading-tight" style={{ color: 'var(--foreground)' }}>Draft Reply</span>
          </Link>
          <button onClick={() => setShowTrophy(true)}
            className="rounded-xl flex flex-col items-center justify-center gap-1.5 py-4 transition-opacity hover:opacity-80 active:scale-95 relative"
            style={{ background: 'rgba(0,217,255,0.08)', border: '1px solid rgba(0,217,255,0.18)' }}>
            {completedTitles.length > 0 && (
              <span className="absolute top-2 right-2 rounded-full w-4 h-4 flex items-center justify-center text-[9px] font-bold"
                style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}>
                {completedTitles.length}
              </span>
            )}
            <Trophy className="w-5 h-5" style={{ color: 'var(--color-cyan)' }} />
            <span className="text-xs font-semibold text-center leading-tight" style={{ color: 'var(--foreground)' }}>Trophy</span>
          </button>
        </div>
      </Card>

      {/* ── Voice (Jarvis) ── */}
      <div className="max-sm:mx-3">
        <JarvisCard />
      </div>

    </div>
    </>
  );
}
type AssignTaskResponse = {
  assigned?: string;
  ownerId?: string | null;
};
