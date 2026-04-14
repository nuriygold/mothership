'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ElementType } from 'react';
import { X, CheckCircle2, Send, Zap, Clock, MessageSquare, Sparkles, Star, Rocket, Layers } from 'lucide-react';
import type { V2DashboardPriorityItem } from '@/lib/v2/types';
import { BOT_COLORS, BOT_TELEGRAM_KEY, normalizeBotName } from '@/lib/constants/today';

interface TakeActionModalProps {
  item: V2DashboardPriorityItem;
  onClose: () => void;
  onDone: () => void;
  onComplete: (taskId: string) => void | Promise<void>;
  onGateway: (title: string) => void;
  onStartWorking?: (item: V2DashboardPriorityItem) => void;
  onDispatch?: (item: V2DashboardPriorityItem) => void;
  /** If provided, shows an "Add to Vision Board" action row */
  onAddToVisionBoard?: (taskId: string) => Promise<void>;
  /** Hide the "Approve Route to {bot}" row — useful in Kanban context (default: true) */
  showRouteApproval?: boolean;
  /**
   * Current task state — used to show only relevant status-change actions.
   * When omitted all actions are shown for backward compatibility.
   */
  taskStatus?: 'Active' | 'Queued' | 'Blocked' | 'Done';
}

export function TakeActionModal({ item, onClose, onDone, onComplete, onGateway, onStartWorking, onDispatch, onAddToVisionBoard, showRouteApproval = true, taskStatus: taskStatusProp }: TakeActionModalProps) {
  // Prefer the explicit prop; fall back to item.taskStatus so callers that
  // don't pass the prop (e.g. Today page) still get status-aware behaviour
  // once the API populates it on the item.
  const taskStatus = taskStatusProp ?? item.taskStatus;

  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    closeBtnRef.current?.focus();
    return () => {
      (previousFocusRef.current as HTMLElement | null)?.focus();
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [busy, onClose]);

  async function run(key: string, fn: () => void | Promise<void>) {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      setDone(key);
      setTimeout(() => {
        onDone();
        onClose();
      }, 800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
      setBusy(null);
    }
  }

  const normalizedBot = normalizeBotName(item.assignedBot);
  const botC = BOT_COLORS[normalizedBot] ?? BOT_COLORS.Adrian;
  // Which status-change actions make sense for the current task state
  const showDone    = item.taskId && taskStatus !== 'Done';
  const showStart   = item.taskId && taskStatus !== 'Active' && taskStatus !== 'Done';
  const showDefer   = item.taskId && taskStatus !== 'Done';
  const showUnblock = item.taskId && taskStatus === 'Blocked';

  const actions: Array<{
    key: string;
    icon: ElementType<{ className?: string; style?: CSSProperties }>;
    label: string;
    desc: string;
    color: string;
    textColor: string;
    fn: () => void | Promise<void>;
  }> = [
    ...(showDone
      ? [
          {
            key: 'done',
            icon: CheckCircle2,
            label: 'Mark as Done',
            desc: 'Complete this task and log it to Trophy',
            color: 'var(--color-mint)',
            textColor: 'var(--color-mint-text)',
            fn: () => { onComplete(item.taskId!); },
          },
        ]
      : []),
    ...(showUnblock
      ? [
          {
            key: 'unblock',
            icon: Zap,
            label: 'Unblock',
            desc: 'Mark as unblocked and move back to In Progress',
            color: 'var(--color-cyan)',
            textColor: '#0A0E1A',
            fn: async () => {
              const res = await fetch(`/api/v2/tasks/${item.taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'unblock' }),
              });
              if (!res.ok) throw new Error(`${res.status}`);
            },
          },
        ]
      : []),
    ...(showStart
      ? [
          {
            key: 'start',
            icon: Zap,
            label: 'Start Working',
            desc: 'Move to Today\'s Timeline and set to In Progress',
            color: 'var(--color-lemon)',
            textColor: 'var(--color-lemon-text)',
            fn: async () => {
              const res = await fetch(`/api/v2/tasks/${item.taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'start' }),
              });
              if (!res.ok) throw new Error(`${res.status}`);
              onStartWorking?.(item);
            },
          },
        ]
      : []),
    ...(showDefer
      ? [
          {
            key: 'defer',
            icon: Clock,
            label: 'Not Today',
            desc: 'Move back to the queue — tackle it another day',
            color: 'var(--color-lavender)',
            textColor: 'var(--color-lavender-text)',
            fn: async () => {
              const res = await fetch(`/api/v2/tasks/${item.taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'defer' }),
              });
              if (!res.ok) throw new Error(`${res.status}`);
            },
          },
        ]
      : []),
    ...(item.taskId && onAddToVisionBoard
      ? [
          {
            key: 'vision_board',
            icon: Layers,
            label: 'Add to Vision Board',
            desc: 'Tag this task with domain: vision board and show a marker on the Kanban card',
            color: '#69f49d',
            textColor: '#0A4A35',
            fn: async () => {
              await onAddToVisionBoard(item.taskId!);
            },
          },
        ]
      : []),
    {
      key: 'dispatch',
      icon: Rocket,
      label: 'Dispatch This',
      desc: 'Template this task in Dispatch and start a campaign',
      color: 'var(--color-cyan)',
      textColor: '#0A0E1A',
      fn: () => {
        onDispatch?.(item);
      },
    },
    ...(showRouteApproval
      ? [
          {
            key: 'route',
            icon: Send,
            label: `Approve Route to ${normalizedBot}`,
            desc: `Approve this routing action in queue (does not change task status)`,
            color: botC.bg,
            textColor: botC.text,
            fn: async () => {
              const res = await fetch(item.actionWebhook, { method: 'POST' });
              if (!res.ok) throw new Error(`${res.status}`);
            },
          },
        ]
      : []),
    {
      key: 'telegram',
      icon: MessageSquare,
      label: `Message ${normalizedBot}`,
      desc: `Send a direct Telegram message to ${normalizedBot}`,
      color: botC.bg,
      textColor: botC.text,
      fn: async () => {
        const botKey = BOT_TELEGRAM_KEY[normalizedBot] ?? BOT_TELEGRAM_KEY.Adrian ?? 'bot1';
        const res = await fetch('/api/telegram/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `Action needed: ${item.title}`, botKey }),
        });
        if (!res.ok) throw new Error(`${res.status}`);
      },
    },
    {
      key: 'ruby',
      icon: Sparkles,
      label: 'Ask Ruby',
      desc: 'Open Ruby with this task as context',
      color: 'var(--color-pink)',
      textColor: 'var(--color-pink-text)',
      fn: () => {
        onGateway(item.title);
      },
    },
    {
      key: 'search',
      icon: Star,
      label: 'Search Web',
      desc: `Google "${item.title}"`,
      color: 'var(--color-sky)',
      textColor: 'var(--color-sky-text)',
      fn: () => {
        window.open(`https://www.google.com/search?q=${encodeURIComponent(item.title)}`, '_blank', 'noopener noreferrer');
      },
    },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="take-action-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
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
        <div
          className="flex items-start gap-3 px-5 py-4 rounded-t-3xl flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border)', borderLeft: `4px solid ${botC.bg}` }}
        >
          <div className="flex-1 min-w-0">
            <h2 id="take-action-modal-title" className="text-sm font-semibold leading-snug" style={{ color: 'var(--foreground)' }}>
              {item.title}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{item.source}</p>
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0"
            style={{ background: botC.bg, color: botC.text }}
          >
             {normalizedBot}
          </span>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            disabled={!!busy}
            aria-label="Close"
            className="w-7 h-7 rounded-xl flex items-center justify-center transition-opacity hover:opacity-70 disabled:opacity-30 flex-shrink-0"
            style={{ background: 'rgba(0,0,0,0.06)' }}
          >
            <X className="w-3.5 h-3.5" style={{ color: 'var(--foreground)' }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 scrollbar-hide">
          {actions.map((action) => (
            <button
              key={action.key}
              disabled={busy !== null}
              onClick={() => void run(action.key, action.fn)}
              className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition-opacity hover:opacity-85 disabled:cursor-not-allowed"
              style={{
                background: done === action.key ? action.color : 'var(--bg-secondary, var(--muted))',
                opacity: busy && busy !== action.key ? 0.4 : 1,
              }}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: action.color }}>
                {busy === action.key ? (
                  <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: action.textColor, borderTopColor: 'transparent' }} />
                ) : done === action.key ? (
                  <CheckCircle2 className="w-4 h-4" style={{ color: action.textColor }} />
                ) : (
                  <action.icon className="w-4 h-4" style={{ color: action.textColor }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>{action.label}</p>
                <p className="text-xs truncate" style={{ color: 'var(--muted-foreground)' }}>{action.desc}</p>
              </div>
            </button>
          ))}
          {err && <p className="text-xs px-2 pt-1" style={{ color: 'var(--destructive, #ef4444)' }}>{err}</p>}
        </div>

        <div className="px-4 py-3 flex-shrink-0 flex justify-end" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onClose}
            disabled={!!busy}
            className="rounded-xl px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
