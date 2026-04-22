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
import { Card, CardTitle } from '@/components/ui/card';
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
      background: 'rgba(255,255,255,0.6)',
      borderRadius: '8px',
      border: '1px solid #90c8e0',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderBottom: '1px solid #b8e0f5', background: 'var(--bg2)' }}>
        <span style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: streamStatus === 'live' ? '#40c8f0' : '#f0b030',
          boxShadow: streamStatus === 'live' ? '0 0 6px #40c8f090' : 'none',
          animation: streamStatus === 'live' ? 'pulseRing 2s ease-in-out infinite' : 'none',
          display: 'inline-block',
          flexShrink: 0,
        }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          SSE / STREAM
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '9px', color: streamStatus === 'live' ? '#0470a0' : '#f0b030' }}>
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
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8px', color: 'var(--text3)', flexShrink: 0 }}>{l.ts}</span>
            )}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--text2)', wordBreak: 'break-all' }}>{l.msg}</span>
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
            fontFamily: 'var(--font-script)',
            fontWeight: 600,
            fontSize: '28px',
            color: 'var(--ice2)',
            marginTop: '6px',
            lineHeight: 1.3,
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
