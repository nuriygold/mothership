'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ElementType } from 'react';
import { X, CheckCircle2, Send, Zap, Clock, MessageSquare, Sparkles, Star } from 'lucide-react';
import type { V2DashboardPriorityItem } from '@/lib/v2/types';
import { BOT_COLORS, BOT_TELEGRAM_KEY } from '@/lib/constants/today';

interface TakeActionModalProps {
  item: V2DashboardPriorityItem;
  onClose: () => void;
  onDone: () => void;
  onComplete: (taskId: string) => void;
  onGateway: (title: string) => void;
}

export function TakeActionModal({ item, onClose, onDone, onComplete, onGateway }: TakeActionModalProps) {
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

  const botC = BOT_COLORS[item.assignedBot] ?? BOT_COLORS.Adrian;
  const actions: Array<{
    key: string;
    icon: ElementType<{ className?: string; style?: CSSProperties }>;
    label: string;
    desc: string;
    color: string;
    textColor: string;
    fn: () => void | Promise<void>;
  }> = [
    ...(item.taskId
      ? [
          {
            key: 'done',
            icon: CheckCircle2,
            label: 'Mark as Done',
            desc: 'Complete this task and log it to Trophy',
            color: 'var(--color-mint)',
            textColor: 'var(--color-mint-text)',
            fn: () => {
              onComplete(item.taskId!);
            },
          },
          {
            key: 'start',
            icon: Zap,
            label: 'Start Working',
            desc: 'Set this task to In Progress',
            color: 'var(--color-lemon)',
            textColor: 'var(--color-lemon-text)',
            fn: async () => {
              const res = await fetch(`/api/v2/tasks/${item.taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'start' }),
              });
              if (!res.ok) throw new Error(`${res.status}`);
            },
          },
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
    {
      key: 'route',
      icon: Send,
      label: `Route to ${item.assignedBot}`,
      desc: `Approve and send to ${item.assignedBot} via the action queue`,
      color: botC.bg,
      textColor: botC.text,
      fn: async () => {
        const res = await fetch(item.actionWebhook, { method: 'POST' });
        if (!res.ok) throw new Error(`${res.status}`);
      },
    },
    {
      key: 'telegram',
      icon: MessageSquare,
      label: `Message ${item.assignedBot}`,
      desc: `Send a direct Telegram message to ${item.assignedBot}`,
      color: botC.bg,
      textColor: botC.text,
      fn: async () => {
        const botKey = BOT_TELEGRAM_KEY[item.assignedBot] ?? BOT_TELEGRAM_KEY.Adrian ?? 'bot1';
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
      desc: 'Open the AI chat panel with this task as context',
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
            {item.assignedBot}
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
