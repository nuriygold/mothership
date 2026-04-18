'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  TrendingUp, Mail, Search, FileText, Anchor,
  CheckCircle2, ChevronDown,
  WifiOff, Users, Send, X, Loader2,
} from 'lucide-react';
import type { V2BotProfile, V2BotsFeed } from '@/lib/v2/types';

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
};

// Text color safe for always-light pastel card backgrounds (no dark-mode override on pastels)
const CARD_FG = '#0F1B35';

const COLOR_SCHEME: Record<string, { bg: string; text: string }> = {
  mint:     { bg: 'var(--color-mint)',     text: 'var(--color-mint-text)'     },
  pink:     { bg: 'var(--color-pink)',     text: 'var(--color-pink-text)'     },
  sky:      { bg: 'var(--color-sky)',      text: 'var(--color-sky-text)'      },
  lemon:    { bg: 'var(--color-lemon)',    text: 'var(--color-lemon-text)'    },
  lavender: { bg: 'var(--color-lavender)', text: 'var(--color-lavender-text)' },
};

const BOT_ICON: Record<string, React.ElementType> = {
  'trending-up': TrendingUp,
  'mail':        Mail,
  'search':      Search,
  'file-text':   FileText,
  'anchor':      Anchor,
};

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  working: { color: 'var(--color-cyan)', label: 'Working' },
  idle:    { color: '#FFB800',           label: 'Idle'    },
  blocked: { color: '#E53E3E',           label: 'Blocked' },
};

// Per-bot dedicated dispatch endpoints (each has session support + correct context injection)
const BOT_DISPATCH_URL: Record<string, string> = {
  'Adrian':         '/api/v2/adrian/dispatch',
  'Ruby':           '/api/v2/ruby/dispatch',
  'Emerald':        '/api/v2/emerald/dispatch',
  'Adobe Pettaway': '/api/v2/adobe/dispatch',
  'Anchor':         '/api/v2/anchor/dispatch',
};

function BotCardSkeleton() {
  return (
    <div
      className="rounded-3xl p-5 flex flex-col gap-4 animate-pulse"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ background: 'var(--muted)' }} />
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-28 rounded-full" style={{ background: 'var(--muted)' }} />
          <div className="h-3 w-20 rounded-full" style={{ background: 'var(--muted)' }} />
        </div>
      </div>
      <div className="rounded-2xl h-16" style={{ background: 'var(--muted)' }} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 rounded-2xl" style={{ background: 'var(--muted)' }} />
        ))}
      </div>
      <div className="space-y-2">
        <div className="h-3 w-32 rounded-full" style={{ background: 'var(--muted)' }} />
        <div className="h-3 w-full rounded-full" style={{ background: 'var(--muted)' }} />
        <div className="h-3 w-4/5 rounded-full" style={{ background: 'var(--muted)' }} />
      </div>
      <div className="flex gap-2 mt-auto">
        <div className="flex-1 h-11 rounded-2xl" style={{ background: 'var(--muted)' }} />
        <div className="w-11 h-11 rounded-2xl" style={{ background: 'var(--muted)' }} />
      </div>
    </div>
  );
}

function BotCard({ bot }: { bot: V2BotProfile }) {
  const [expanded, setExpanded] = useState(false);
  const [instructing, setInstructing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState('');
  const [responseError, setResponseError] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Stable session ID for this card — persists across instructions within the same page session
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  const scheme = COLOR_SCHEME[bot.identity.colorKey] ?? COLOR_SCHEME.lavender;
  const BotIcon = BOT_ICON[bot.identity.iconKey] ?? FileText;
  const statusConfig = STATUS_CONFIG[bot.liveState.status] ?? STATUS_CONFIG.idle;
  const isIdle = bot.liveState.status === 'idle';
  const currentTaskIsPlaceholder =
    bot.liveState.currentTask === 'Awaiting assignment' || bot.liveState.currentTask === '';

  const visibleOutputs = bot.recentOutputs.slice(0, expanded ? undefined : 3);
  const hasMore = !expanded && bot.recentOutputs.length > 3;

  const dispatchUrl = BOT_DISPATCH_URL[bot.identity.name] ?? `/api/v2/bots/${bot.identity.name.toLowerCase()}/dispatch`;

  function openInstructPanel() {
    setInstructing(true);
    setResponse('');
    setResponseError('');
    setDraft('');
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  function closeInstructPanel() {
    setInstructing(false);
    setDraft('');
    setResponse('');
    setResponseError('');
    setSending(false);
  }

  async function sendInstruction() {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setResponse('');
    setResponseError('');

    try {
      const res = await fetch(dispatchUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sessionId: sessionIdRef.current }),
      });

      if (!res.ok || !res.body) {
        setResponseError(`Request failed (${res.status})`);
        setSending(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') break;
          try {
            const evt = JSON.parse(dataStr);
            if (evt.delta) setResponse((r) => r + evt.delta);
            if (evt.error) setResponseError(evt.error);
          } catch (_) {}
        }
      }
    } catch (err) {
      setResponseError(err instanceof Error ? err.message : 'Failed to reach bot');
    }

    setSending(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendInstruction();
    }
  }

  return (
    <div
      className="rounded-3xl p-5 flex flex-col"
      style={{ background: scheme.bg, border: '1px solid rgba(0,0,0,0.06)' }}
    >
      {/* Header: icon + name/role + status */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)' }}
          >
            <BotIcon className="w-5 h-5" style={{ color: scheme.text }} />
          </div>
          <div>
            <h3 className="text-lg font-semibold leading-tight" style={{ color: CARD_FG }}>
              {bot.identity.name}
            </h3>
            <p className="text-xs" style={{ color: scheme.text }}>{bot.identity.role}</p>
          </div>
        </div>
        {/* Status indicator: dot + text label */}
        <div className="flex items-center gap-1.5 pt-0.5">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: statusConfig.color }}
          />
          <span className="text-xs font-medium" style={{ color: statusConfig.color }}>
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Currently working on */}
      <div
        className="rounded-2xl px-4 py-3 mb-4"
        style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)' }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: scheme.text }}>
          Currently
        </p>
        {isIdle || currentTaskIsPlaceholder ? (
          <p className="text-sm italic" style={{ color: CARD_FG, opacity: 0.5 }}>
            {currentTaskIsPlaceholder ? 'No active task' : bot.liveState.currentTask}
          </p>
        ) : (
          <p className="text-sm font-medium" style={{ color: CARD_FG }}>
            {bot.liveState.currentTask}
          </p>
        )}
      </div>

      {/* Throughput metrics — neutral white-alpha cells to avoid pastel-on-pastel conflict */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Completed', value: bot.throughputMetrics.completed },
          { label: 'Queued',    value: bot.throughputMetrics.queued    },
          { label: 'Blocked',   value: bot.throughputMetrics.blocked   },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-2xl py-3 text-center"
            style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,0,0,0.04)' }}
          >
            <p className="text-xl font-bold" style={{ color: CARD_FG }}>{value}</p>
            <p className="text-[10px] font-medium" style={{ color: scheme.text }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Recent outputs — always rendered for consistent card height */}
      <div className="mb-4">
        <p className="text-xs font-semibold mb-2" style={{ color: scheme.text }}>Recent Outputs</p>
        <div className="space-y-1.5 min-h-[4.5rem]">
          {bot.recentOutputs.length === 0 ? (
            <p className="text-sm italic" style={{ color: CARD_FG, opacity: 0.45 }}>No recent outputs</p>
          ) : (
            <>
              {visibleOutputs.map((output, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2
                      className="w-3.5 h-3.5 flex-shrink-0"
                      style={{ color: 'var(--color-cyan)' }}
                    />
                    <span className="text-sm truncate" style={{ color: CARD_FG }}>{output.title}</span>
                  </div>
                  <span
                    className="text-[11px] flex-shrink-0 ml-2"
                    style={{ color: scheme.text, opacity: 0.8 }}
                  >
                    {output.timestamp}
                  </span>
                </div>
              ))}
              {hasMore && (
                <button
                  onClick={() => setExpanded(true)}
                  className="flex items-center gap-1 text-xs font-medium mt-1 transition-opacity hover:opacity-70"
                  style={{ color: scheme.text }}
                >
                  Show all ({bot.recentOutputs.length})
                  <ChevronDown className="w-3 h-3" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Working style */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: scheme.text }}>
          Working Style
        </p>
        <p className="text-sm" style={{ color: CARD_FG }}>{bot.staticProfile.workingStyle}</p>
      </div>

      {/* Personality */}
      <div className="mb-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: scheme.text }}>
          Personality
        </p>
        <p className="text-sm italic" style={{ color: CARD_FG }}>{bot.staticProfile.personality}</p>
      </div>

      {/* Strengths */}
      <div className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: scheme.text }}>
          Strengths
        </p>
        <div className="flex flex-wrap gap-1.5">
          {bot.staticProfile.strengths.map((s) => (
            <span
              key={s}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                background: 'rgba(255,255,255,0.6)',
                color: CARD_FG,
                border: '1px solid rgba(255,255,255,0.8)',
              }}
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Instruction panel */}
      {instructing && (
        <div
          className="mb-4 rounded-2xl p-3 flex flex-col gap-2"
          style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)' }}
        >
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: scheme.text }}>
              Send instruction to {bot.identity.name}
            </p>
            <button onClick={closeInstructPanel} className="opacity-40 hover:opacity-70 transition-opacity">
              <X className="w-3.5 h-3.5" style={{ color: CARD_FG }} />
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type an instruction… (Enter to send)"
            rows={3}
            disabled={sending}
            className="w-full resize-none rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              background: 'rgba(255,255,255,0.8)',
              border: '1px solid rgba(0,0,0,0.08)',
              color: CARD_FG,
              opacity: sending ? 0.6 : 1,
            }}
          />
          <button
            onClick={() => void sendInstruction()}
            disabled={!draft.trim() || sending}
            className="flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-semibold transition-opacity hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'var(--color-purple)', color: '#fff' }}
          >
            {sending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
            ) : (
              <><Send className="w-4 h-4" /> Send</>
            )}
          </button>
          {/* Streaming response */}
          {(response || responseError) && (
            <div
              className="rounded-xl px-3 py-2.5 text-sm whitespace-pre-wrap"
              style={{
                background: responseError ? 'rgba(229,62,62,0.08)' : 'rgba(255,255,255,0.85)',
                border: `1px solid ${responseError ? 'rgba(229,62,62,0.2)' : 'rgba(0,0,0,0.06)'}`,
                color: responseError ? '#E53E3E' : CARD_FG,
              }}
            >
              {responseError || response}
              {sending && !responseError && (
                <span className="inline-block w-1.5 h-4 ml-0.5 rounded-sm animate-pulse" style={{ background: scheme.text, verticalAlign: 'middle' }} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer: actions */}
      <div className="mt-auto flex items-center gap-2">
        <button
          onClick={instructing ? closeInstructPanel : openInstructPanel}
          className="flex-1 rounded-2xl py-3 text-sm font-semibold text-center transition-opacity hover:opacity-85"
          style={{ background: 'var(--color-purple)', color: '#FFFFFF' }}
        >
          {instructing ? 'Close' : 'Instruct'}
        </button>
      </div>
    </div>
  );
}

export default function BotsPage() {
  const [streamStatus, setStreamStatus] = useState<'live' | 'fallback'>('fallback');
  const { data, error, mutate } = useSWR<V2BotsFeed>('/api/v2/bots', fetcher, {
    refreshInterval: streamStatus === 'live' ? 0 : 30_000,
  });

  const mutateRef = useRef(mutate);
  useEffect(() => { mutateRef.current = mutate; }, [mutate]);

  useEffect(() => {
    let stream: EventSource;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      stream = new EventSource('/api/v2/stream/bots');
      stream.addEventListener('connected', () => setStreamStatus('live'));
      stream.addEventListener('task.routed', () => void mutateRef.current());
      stream.onerror = () => {
        setStreamStatus('fallback');
        stream.close();
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();
    return () => { stream.close(); clearTimeout(reconnectTimer); };
  }, []);

  const isLoading = !data && !error;

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold" style={{ color: 'var(--foreground)' }}>Bots</h1>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Your staffed operations bench
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-medium self-start sm:self-auto"
          style={{
            background: streamStatus === 'live' ? 'var(--color-mint)' : 'var(--color-lemon)',
            color: streamStatus === 'live' ? 'var(--color-mint-text)' : 'var(--color-lemon-text)',
          }}
        >
          {streamStatus === 'live' ? 'Live' : 'Refreshing'}
        </span>
      </div>

      {/* Error state */}
      {error && (
        <div
          className="rounded-3xl p-10 flex flex-col items-center gap-3 text-center"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <WifiOff className="w-8 h-8 opacity-40" style={{ color: 'var(--foreground)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
            Unable to load bots
          </p>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Check your connection or try again
          </p>
          <button
            onClick={() => void mutate()}
            className="mt-2 rounded-xl px-4 py-2 text-sm font-medium transition-opacity hover:opacity-85"
            style={{ background: 'var(--color-purple)', color: '#fff' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid gap-5 md:grid-cols-2">
          {[0, 1, 2, 3, 4].map((i) => <BotCardSkeleton key={i} />)}
        </div>
      )}

      {/* Bot grid */}
      {data && (
        <div className="grid gap-5 md:grid-cols-2">
          {data.bots.length === 0 ? (
              <div
               className="md:col-span-2 rounded-3xl p-10 flex flex-col items-center gap-3 text-center"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <Users className="w-8 h-8 opacity-30" style={{ color: 'var(--foreground)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
                No bots on the bench yet
              </p>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                Bots will appear here once they&apos;re assigned tasks.
              </p>
            </div>
          ) : (
            data.bots.map((bot) => <BotCard key={bot.identity.name} bot={bot} />)
          )}
        </div>
      )}
    </div>
  );
}
