'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import {
  Calendar, CheckCircle2, Zap, Video,
  Trophy, Plus,
  ListChecks, MessageSquare,
  Send, Sparkles, Rocket,
} from 'lucide-react';
import { TrophyModal } from '@/components/today/trophy-modal';
import { TakeActionModal } from '@/components/today/take-action-modal';
import { AssignToDropdown } from '@/components/today/assign-to-dropdown';
import { WellnessAnchors } from '@/components/today/wellness-anchors';
import { JarvisCard } from '@/components/voice/jarvis-card';
import { NewTaskModal } from '@/components/today/new-task-modal';
import { DailyBriefing } from '@/components/today/daily-briefing';
import { FinanceAlerts } from '@/components/today/finance-alerts';
import { StatusTicker } from '@/components/today/status-ticker';
import { ThreeDayGrid } from '@/components/today/three-day-grid';
import { BOT_TELEGRAM_KEY, BOT_COLORS, BOT_BORDER, BOT_OWNER_LOGIN, normalizeBotName } from '@/lib/constants/today';
import type { V2DashboardPriorityItem, V2DashboardTimelineItem, V2TodayFeed, V2TaskItem, V2TasksFeed } from '@/lib/v2/types';
import type { CalendarEvent } from '@/lib/services/calendar';

type CalendarTimelineItem = {
  _calEvent: true;
  id: string;
  title: string;
  startDate: string;
  startTime: string;
  endTime: string | null;
  status: 'done' | 'current' | 'upcoming';
  meetingUrl?: string | null;
  location?: string | null;
};

type MergedItem =
  | (V2DashboardTimelineItem & { _calEvent?: false })
  | CalendarTimelineItem;

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

// ── SSE Live Feed Box ──────────────────────────────────────────────────────────
function SseLiveBox({ streamStatus }: { streamStatus: 'live' | 'fallback' }) {
  const [logs, setLogs] = useState<Array<{ msg: string; ts: string }>>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  // Fake a few log entries to show the styled box even without real events
  useEffect(() => {
    setLogs([
      { msg: 'CONNECTED  dashboard stream', ts: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
      { msg: `STATUS     ${streamStatus === 'live' ? 'live' : 'polling fallback'}`, ts: '' },
    ]);
  }, [streamStatus]);

  // Auto-scroll
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [logs]);

  return (
    <div style={{
      background: '#04141e',
      borderRadius: '12px',
      border: '1px solid #0d3050',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: '1px solid #0d3050' }}>
        {/* Live pulse dot */}
        <span style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: streamStatus === 'live' ? '#40c8f0' : '#FFB800',
          boxShadow: streamStatus === 'live' ? '0 0 6px rgba(64,200,240,0.8)' : 'none',
          animation: streamStatus === 'live' ? 'pulseRing 2s ease-in-out infinite' : 'none',
          display: 'inline-block',
          flexShrink: 0,
        }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: '#40c8f0', letterSpacing: '0.1em', fontWeight: 500 }}>
          SSE / STREAM
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '9px', color: streamStatus === 'live' ? '#40c8f0' : '#FFB800', opacity: 0.8 }}>
          {streamStatus === 'live' ? 'LIVE' : 'FALLBACK'}
        </span>
      </div>
      {/* Log body */}
      <div
        ref={boxRef}
        style={{ padding: '10px 12px', overflowY: 'auto', maxHeight: '140px', display: 'flex', flexDirection: 'column', gap: '4px' }}
      >
        {logs.map((l, i) => (
          <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            {l.ts && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: '#0470a0', flexShrink: 0 }}>{l.ts}</span>
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: '#7ab8d8', wordBreak: 'break-all' }}>{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TodayPage() {
  const { data, mutate } = useSWR<V2TodayFeed>('/api/v2/dashboard/today', fetcher, { refreshInterval: 30000 });
  const { data: calData } = useSWR<{ events: CalendarEvent[]; configured: boolean }>('/api/v2/calendar/events', fetcher, { refreshInterval: 60000 });
  const { data: tasksData, mutate: mutateTasks } = useSWR<V2TasksFeed>('/api/v2/tasks', fetcher, { refreshInterval: 30000 });
  const { data: campaignsData } = useSWR<CampaignListItem[]>('/api/dispatch/campaigns', fetcher, { refreshInterval: 120000 });
  const [streamStatus, setStreamStatus] = useState<'live' | 'fallback'>('fallback');
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [completedTitles, setCompletedTitles] = useState<string[]>([]);
  const [showTrophy, setShowTrophy] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [actionModalItem, setActionModalItem] = useState<V2DashboardPriorityItem | null>(null);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const nowRef = useRef<HTMLDivElement>(null);

  // EventSource with retry (up to 3 attempts: 2s, 4s, 8s backoff)
  useEffect(() => {
    let attempts = 0;
    let stream: EventSource;
    function connect() {
      stream = new EventSource('/api/v2/stream/dashboard');
      stream.addEventListener('connected', () => { attempts = 0; setStreamStatus('live'); });
      stream.addEventListener('approval.updated', () => { void mutate(); void mutateTasks(); });
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
  }, [mutate, mutateTasks]);

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
          _calEvent: true as const,
          id: ev.id,
          title: ev.title,
          startTime: ev.startTime,
          endTime: ev.endTime,
          startDate: ev.startDate,
          meetingUrl: ev.meetingUrl ?? null,
          location: ev.location ?? null,
          status: ev.status,
        } satisfies CalendarTimelineItem);
      }
    }

    // Sort by startDate if available, otherwise keep original order
    combined.sort((a, b) => {
      const aDate = a.startDate;
      const bDate = b.startDate;
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
      if (item.startDate && new Date(item.startDate).getTime() > now) return i;
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
    const title = mergedTimeline.find((t) => !t._calEvent && t.taskId === taskId)?.title ?? taskId;
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
      await mutateTasks();
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
  }, [mutate, mutateTasks, mergedTimeline]);

  // ── Undo Done (from Trophy) ──
  const handleUndoDone = useCallback(async (taskId: string) => {
    const title = mergedTimeline.find((t) => !t._calEvent && t.taskId === taskId)?.title ?? taskId;
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
      await mutateTasks();
      setToastMsg('Task moved back to timeline');
    } catch (error) {
      setCompletedIds((prev) => new Set([...prev, taskId]));
      setCompletedTitles((prev) => [...prev, title]);
      setToastMsg(`Couldn't defer "${title}"`);
      logTodayClientFailure('task_defer', error, { taskId });
    }
  }, [mergedTimeline, mutate, mutateTasks]);

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
      await mutateTasks();
      setToastMsg(`"${taskTitle}" assigned to ${payload.assigned ?? normalizedBot}`);
      if (!telegramRes.ok) {
        logTodayClientFailure('assignment_telegram', new Error(`Telegram notify failed (${telegramRes.status})`), { taskId, botName: normalizedBot });
      }
    } catch (error) {
      setToastMsg(`Couldn't assign "${taskTitle}" to ${normalizedBot}`);
      logTodayClientFailure('task_assign', error, { taskId, botName: normalizedBot, ownerLogin });
    }
  }, [mutate, mutateTasks]);

  // ── Take Action ──
  const handleTakeAction = useCallback((item: V2DashboardPriorityItem) => {
    setActionModalItem(item);
  }, []);

  const calEvents = calData?.events ?? [];

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
        onDone={() => { void mutate(); void mutateTasks(); }}
        onComplete={handleComplete}
        onGateway={(title) => { handleGateway(title); setActionModalItem(null); }}
        onDispatch={(item) => { handleDispatch(item); }}
        showRouteApproval={false}
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

    {showNewTaskModal && (
      <NewTaskModal
        onClose={() => setShowNewTaskModal(false)}
        onSuccess={() => {
          void mutate();
          void mutateTasks();
          setToastMsg('Task created successfully');
        }}
      />
    )}

    {/* Toast notification */}
    {toastMsg && (
      <div
        className="fixed top-4 right-4 z-50 rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-in fade-in slide-in-from-top-2"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          background: 'rgba(255,255,255,0.95)',
          color: 'var(--ice-text2)',
          border: '1px solid var(--ice-border)',
          boxShadow: '0 4px 20px rgba(64,200,240,0.15)',
        }}
      >
        {toastMsg}
      </div>
    )}

    {/* ── Status Ticker — full-width above page content ── */}
    <div className="relative -mx-4 md:-mx-8 -mt-5 md:-mt-8 mb-5">
      <StatusTicker />
    </div>

    <div className="space-y-4 md:space-y-5" style={{ background: 'var(--ice-bg)', minHeight: '100%', borderRadius: '0' }}>

      {/* ── Greeting ── */}
      <div style={{ paddingBottom: '2px' }}>
        <h1
          style={{
            fontFamily: 'var(--font-rajdhani)',
            fontWeight: 700,
            fontSize: '32px',
            color: 'var(--ice-text)',
            letterSpacing: '1px',
            lineHeight: 1.1,
          }}
        >
          {greeting}
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: '12px',
            fontStyle: 'italic',
            color: 'var(--ice-text2)',
            marginTop: '4px',
          }}
        >
          {affirmation || 'You move with intention and grace.'}
        </p>
      </div>

      {/* ── Daily Briefing ── (restyled via inline override on the wrapper) */}
      <div style={{
        background: 'rgba(255,255,255,0.70)',
        border: '1px solid #b8d8e8',
        borderRadius: '12px',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 2px 16px rgba(64,168,200,0.08)',
        padding: '12px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ice-text3)', fontWeight: 500 }}>
            TODAY&apos;S BRIEFING
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ice-text3)', opacity: 0.7 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
        {/* Render the actual briefing content */}
        <DailyBriefing tasksData={tasksData} campaigns={campaignsData} />
      </div>

      {/* ── Finance Alerts ── */}
      <FinanceAlerts />

      {/* ── Daily Anchors ── */}
      <WellnessAnchors onAllComplete={handleAnchorAllComplete} />

      {/* ── 3-Day Calendar Grid ── */}
      <ThreeDayGrid events={calEvents} />

      {/* ── SSE Stream ── */}
      <SseLiveBox streamStatus={streamStatus} />

      {/* ── Timeline + Pending approvals — two-column grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {/* Today's Timeline */}
        <div style={{
          background: 'rgba(255,255,255,0.70)',
          border: '1px solid #b8d8e8',
          borderRadius: '12px',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 2px 16px rgba(64,168,200,0.08)',
          padding: '14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar className="w-4 h-4" style={{ color: 'var(--ice)' }} />
              <span style={{ fontFamily: 'var(--font-rajdhani)', fontWeight: 700, fontSize: '14px', letterSpacing: '0.06em', color: 'var(--ice-text)', textTransform: 'uppercase' }}>
                Timeline
              </span>
            </div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '9px',
                borderRadius: '9999px',
                padding: '1px 8px',
                background: streamStatus === 'live' ? 'rgba(64,200,240,0.15)' : 'var(--ice-bg2)',
                color: streamStatus === 'live' ? 'var(--ice2)' : 'var(--ice-text3)',
                letterSpacing: '0.08em',
              }}
            >
              {streamStatus === 'live' ? 'LIVE' : 'POLLING'}
            </span>
          </div>

          <div className="space-y-2">
            {!data ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: 'var(--ice-bg2)' }} />
                ))}
              </div>
            ) : mergedTimeline.length === 0 ? (
              <div style={{ borderRadius: '10px', border: '2px dashed var(--ice-border)', padding: '24px', textAlign: 'center' }}>
                <Calendar className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--ice-border)', opacity: 0.5 }} />
                <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ice-text3)' }}>No events yet — check back when calendar syncs</p>
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
                    const calEntry = entry as { _calEvent: true; id: string; title: string; startTime: string; endTime: string | null; startDate: string; meetingUrl: string | null; location: string | null; status: 'done' | 'current' | 'upcoming' };
                    const isCurrent = calEntry.status === 'current';
                    const isDone = calEntry.status === 'done';
                    return (
                      <div key={`cal-${calEntry.id}`}>
                        {idx === nowIndex && <div ref={nowRef} style={{ height: '2px', background: 'var(--ice)', borderRadius: '2px', margin: '4px 0', boxShadow: '0 0 6px rgba(64,200,240,0.5)' }} />}
                        <div style={{
                          borderRadius: '10px',
                          padding: '10px 12px',
                          border: isCurrent ? `1.5px solid var(--ice)` : '1px solid var(--ice-bg3)',
                          background: isCurrent ? 'rgba(64,200,240,0.08)' : 'rgba(255,255,255,0.5)',
                          opacity: isDone ? 0.5 : 1,
                          transition: 'all 0.15s',
                          borderLeft: `3px solid ${isCurrent ? 'var(--ice)' : 'var(--ice-border)'}`,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 500, color: isCurrent ? 'var(--ice2)' : 'var(--ice-text3)', flexShrink: 0, width: '48px', opacity: showTime ? 1 : 0 }}>
                                {calEntry.startTime}
                              </span>
                              <div style={{ minWidth: 0 }}>
                                <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ice-text)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textDecoration: isDone ? 'line-through' : 'none' }}>
                                  {calEntry.title}
                                </span>
                                {calEntry.endTime && (
                                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ice-text3)' }}>
                                    {calEntry.startTime} – {calEntry.endTime}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', background: 'var(--ice-bg2)', color: 'var(--ice-text2)', borderRadius: '9999px', padding: '1px 6px' }}>Cal</span>
                              {isCurrent && (
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', background: 'var(--ice)', color: '#fff', borderRadius: '9999px', padding: '1px 6px' }}>NOW</span>
                              )}
                              {calEntry.meetingUrl && !isDone && (
                                <a href={calEntry.meetingUrl} target="_blank" rel="noopener noreferrer"
                                  style={{ background: 'var(--ice2)', color: '#fff', borderRadius: '6px', padding: '3px 6px', display: 'flex', alignItems: 'center' }}>
                                  <Video className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Task row
                  const taskEntry = entry as V2DashboardTimelineItem;
                  const isCurrent = taskEntry.status === 'current';
                  const isDone = taskEntry.status === 'done';
                  const normalizedTaskBot = taskEntry.assignedBot ? normalizeBotName(taskEntry.assignedBot) : '';
                  const botColors = normalizedTaskBot ? BOT_COLORS[normalizedTaskBot] : null;

                  return (
                    <div key={`${taskEntry.time}-${taskEntry.title}-${idx}`}>
                      {idx === nowIndex && <div ref={nowRef} style={{ height: '2px', background: 'var(--ice)', borderRadius: '2px', margin: '4px 0', boxShadow: '0 0 6px rgba(64,200,240,0.5)' }} />}
                      <div
                        className="group"
                        style={{
                          borderRadius: '10px',
                          padding: '10px 12px',
                          border: isCurrent ? `1.5px solid var(--ice)` : '1px solid var(--ice-bg3)',
                          background: isCurrent ? 'rgba(64,200,240,0.08)' : 'rgba(255,255,255,0.5)',
                          opacity: isDone ? 0.5 : 1,
                          transition: 'all 0.15s',
                          borderLeft: `3px solid ${isCurrent ? 'var(--ice)' : 'var(--ice-border)'}`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 500, color: isCurrent ? 'var(--ice2)' : 'var(--ice-text3)', flexShrink: 0, width: '48px', opacity: showTime ? 1 : 0 }}>
                              {taskEntry.time}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ice-text)', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', textDecoration: isDone ? 'line-through' : 'none' }}>
                                {taskEntry.title}
                              </span>
                              {taskEntry.endTime && (
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ice-text3)' }}>
                                  {taskEntry.time} – {taskEntry.endTime}
                                </span>
                              )}
                            </div>
                          </div>
                          {!isDone && isCurrent && <Zap className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ice)' }} />}
                        </div>

                        {/* Action buttons */}
                        {!isDone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                            {taskEntry.taskId && (
                              <button
                                type="button"
                                onClick={() => handleComplete(taskEntry.taskId)}
                                style={{ background: 'var(--ice2)', color: '#fff', borderRadius: '8px', padding: '3px 10px', fontFamily: 'var(--font-mono)', fontSize: '10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                <CheckCircle2 className="w-3 h-3" /> Done
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleGateway(taskEntry.title)}
                              style={{ background: 'rgba(255,255,255,0.8)', color: 'var(--ice-text2)', border: '1px solid var(--ice-border)', borderRadius: '8px', padding: '3px 10px', fontFamily: 'var(--font-mono)', fontSize: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Send className="w-3 h-3" /> Ask Ruby
                            </button>
                            {taskEntry.assignedBot && botColors && (
                              <button
                                type="button"
                                onClick={() => handleBotTelegram(normalizedTaskBot, taskEntry.title)}
                                style={{ background: botColors.bg, color: botColors.text, borderRadius: '9999px', padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: '9px', border: 'none', cursor: 'pointer' }}
                                title={`Message ${normalizedTaskBot} on Telegram`}
                              >
                                {normalizedTaskBot}
                              </button>
                            )}
                            {taskEntry.meetingUrl && (
                              <a
                                href={taskEntry.meetingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ background: 'var(--ice2)', color: '#fff', borderRadius: '8px', padding: '3px 10px', fontFamily: 'var(--font-mono)', fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                <Video className="w-3 h-3" /> Join
                              </a>
                            )}
                            {taskEntry.taskId && (
                              <AssignToDropdown
                                currentBot={normalizedTaskBot || taskEntry.assignedBot}
                                taskTitle={taskEntry.title}
                                onAssign={(bot) => handleAssign(taskEntry.taskId!, taskEntry.title, bot)}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* NowLine at end when all entries are in the past */}
                {nowIndex >= mergedTimeline.length && mergedTimeline.length > 0 && (
                  <div ref={nowRef} style={{ height: '2px', background: 'var(--ice)', borderRadius: '2px', margin: '4px 0', boxShadow: '0 0 6px rgba(64,200,240,0.5)' }} />
                )}
              </>
            )}
          </div>
        </div>

        {/* Pending Approvals / Quick Info placeholder */}
        <div style={{
          background: 'rgba(255,255,255,0.70)',
          border: '1px solid #b8d8e8',
          borderRadius: '12px',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 2px 16px rgba(64,168,200,0.08)',
          padding: '14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <Sparkles className="w-4 h-4" style={{ color: 'var(--ice)' }} />
            <span style={{ fontFamily: 'var(--font-rajdhani)', fontWeight: 700, fontSize: '14px', letterSpacing: '0.06em', color: 'var(--ice-text)', textTransform: 'uppercase' }}>
              Pending
            </span>
          </div>
          {tasksData?.active && tasksData.active.length > 0 ? (
            <div className="space-y-2">
              {tasksData.active.slice(0, 3).map((task) => {
                const priorityBorder = task.metadata.priority === 'critical' || task.metadata.priority === 'high'
                  ? '#E53E3E'
                  : task.metadata.priority === 'medium'
                  ? 'var(--ice-gold)'
                  : 'var(--ice)';
                return (
                  <div
                    key={task.taskId}
                    style={{
                      padding: '8px 10px',
                      borderLeft: `3px solid ${priorityBorder}`,
                      paddingLeft: '9px',
                      background: 'rgba(255,255,255,0.5)',
                      borderRadius: '8px',
                      border: '1px solid var(--ice-bg3)',
                      borderLeftColor: priorityBorder,
                      borderLeftWidth: '3px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', background: 'var(--ice-bg2)', color: 'var(--ice-text2)', padding: '1px 5px', borderRadius: '4px' }}>
                        {task.taskId.slice(0, 7).toUpperCase()}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', background: task.status === 'Active' ? 'rgba(64,200,240,0.15)' : 'var(--ice-bg2)', color: task.status === 'Active' ? 'var(--ice2)' : 'var(--ice-text3)', padding: '1px 6px', borderRadius: '9999px' }}>
                        {task.status.toUpperCase()}
                      </span>
                    </div>
                    <p style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '12px', color: 'var(--ice-text)', marginBottom: '6px', lineHeight: 1.3 }}>
                      {task.title}
                    </p>
                    <button
                      type="button"
                      onClick={() => handleTakeAction(toActionItem(task))}
                      style={{ background: 'var(--ice2)', color: '#fff', borderRadius: '8px', padding: '3px 10px', fontFamily: 'var(--font-mono)', fontSize: '10px', border: 'none', cursor: 'pointer', width: '100%' }}
                    >
                      Take Action
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--ice-text3)' }}>
              {!tasksData ? 'Loading...' : 'All clear — no pending items.'}
            </p>
          )}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div style={{
        background: 'rgba(255,255,255,0.70)',
        border: '1px solid #b8d8e8',
        borderRadius: '12px',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        boxShadow: '0 2px 16px rgba(64,168,200,0.08)',
        padding: '14px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
          <Zap className="w-4 h-4" style={{ color: 'var(--ice)' }} />
          <span style={{ fontFamily: 'var(--font-rajdhani)', fontWeight: 700, fontSize: '14px', letterSpacing: '0.06em', color: 'var(--ice-text)', textTransform: 'uppercase' }}>
            Quick Actions
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setShowNewTaskModal(true)}
            className="rounded-xl flex flex-col items-center justify-center gap-1.5 py-4 transition-opacity hover:opacity-80 active:scale-95"
            style={{ background: 'var(--ice-bg2)', border: '1px solid var(--ice-border)' }}
          >
            <Plus className="w-5 h-5" style={{ color: 'var(--ice2)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ice-text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>New Task</span>
          </button>
          <Link
            href="/activity"
            className="rounded-xl flex flex-col items-center justify-center gap-1.5 py-4 transition-opacity hover:opacity-80 active:scale-95"
            style={{ background: 'var(--ice-bg2)', border: '1px solid var(--ice-border)' }}
          >
            <ListChecks className="w-5 h-5" style={{ color: 'var(--ice2)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ice-text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Activity</span>
          </Link>
          <Link
            href="/ruby"
            className="rounded-xl flex flex-col items-center justify-center gap-1.5 py-4 transition-opacity hover:opacity-80 active:scale-95"
            style={{ background: 'var(--ice-bg2)', border: '1px solid var(--ice-border)' }}
          >
            <Sparkles className="w-5 h-5" style={{ color: 'var(--ice2)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ice-text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ask Ruby</span>
          </Link>
          <Link
            href="/dispatch"
            className="rounded-xl flex flex-col items-center justify-center gap-1.5 py-4 transition-opacity hover:opacity-80 active:scale-95"
            style={{ background: 'var(--ice-bg2)', border: '1px solid var(--ice-border)' }}
          >
            <Rocket className="w-5 h-5" style={{ color: 'var(--ice2)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ice-text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Dispatch</span>
          </Link>
          <Link
            href="/email"
            className="rounded-xl flex flex-col items-center justify-center gap-1.5 py-4 transition-opacity hover:opacity-80 active:scale-95"
            style={{ background: 'var(--ice-bg2)', border: '1px solid var(--ice-border)' }}
          >
            <MessageSquare className="w-5 h-5" style={{ color: 'var(--ice2)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ice-text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</span>
          </Link>
          <button
            type="button"
            onClick={() => setShowTrophy(true)}
            className="rounded-xl flex flex-col items-center justify-center gap-1.5 py-4 transition-opacity hover:opacity-80 active:scale-95 relative"
            style={{ background: 'var(--ice-bg2)', border: '1px solid var(--ice-border)' }}
          >
            {completedTitles.length > 0 && (
              <span
                className="absolute top-2 right-2 rounded-full w-4 h-4 flex items-center justify-center"
                style={{ background: 'var(--ice)', color: '#fff', fontFamily: 'var(--font-mono)', fontSize: '9px', fontWeight: 700 }}
              >
                {completedTitles.length}
              </span>
            )}
            <Trophy className="w-5 h-5" style={{ color: 'var(--ice2)' }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--ice-text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Trophy</span>
          </button>
        </div>
      </div>

      {/* ── Voice (Jarvis) ── */}
      <div>
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

type CampaignListItem = {
  id: string;
  title: string;
  status: string | null;
};
