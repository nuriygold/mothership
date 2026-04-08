'use client';

import { useEffect, useRef, useState } from 'react';
import { X, CheckCircle2, Send, Play, Clock } from 'lucide-react';
import type { V2DashboardPriorityItem } from '@/lib/v2/types';

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
  const [loading, setLoading] = useState<'start' | 'defer' | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    closeBtnRef.current?.focus();
    return () => {
      (previousFocusRef.current as HTMLElement | null)?.focus();
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleStart() {
    if (!item.taskId) return;
    setLoading('start');
    try {
      await fetch(`/api/v2/tasks/${item.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      onDone();
      onClose();
    } finally {
      setLoading(null);
    }
  }

  async function handleDefer() {
    if (!item.taskId) return;
    setLoading('defer');
    try {
      await fetch(`/api/v2/tasks/${item.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'defer' }),
      });
      onDone();
      onClose();
    } finally {
      setLoading(null);
    }
  }

  function handleComplete() {
    if (!item.taskId) return;
    onComplete(item.taskId);
    onClose();
  }

  function handleGateway() {
    onGateway(item.title);
    onClose();
  }

  const isOverdue = item.dueAt ? new Date(item.dueAt).getTime() < Date.now() : false;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="take-action-modal-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.3)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-start gap-3 px-5 py-4 rounded-t-3xl"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="min-w-0 flex-1">
            <h2 id="take-action-modal-title" className="text-base font-semibold leading-snug" style={{ color: 'var(--foreground)' }}>
              {item.title}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{item.source}</span>
              {item.assignedBot && (
                <>
                  <span style={{ color: 'var(--muted-foreground)' }}>·</span>
                  <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>{item.assignedBot}</span>
                </>
              )}
              {item.dueAt && (
                <>
                  <span style={{ color: 'var(--muted-foreground)' }}>·</span>
                  <span
                    className="text-xs font-medium"
                    style={{ color: isOverdue ? '#FF5C5C' : 'var(--muted-foreground)' }}
                  >
                    {isOverdue ? 'Overdue · ' : ''}{new Date(item.dueAt).toLocaleDateString()}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-opacity hover:opacity-70 flex-shrink-0"
            style={{ background: 'var(--muted)' }}
          >
            <X className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
          </button>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 space-y-2">
          <button
            onClick={handleComplete}
            disabled={!item.taskId}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-opacity hover:opacity-85 disabled:opacity-40"
            style={{ background: 'var(--color-mint)', color: 'var(--color-mint-text)' }}
          >
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            Mark Complete
          </button>

          <button
            onClick={() => void handleStart()}
            disabled={!item.taskId || loading !== null}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-opacity hover:opacity-85 disabled:opacity-40"
            style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
          >
            <Play className="w-4 h-4 flex-shrink-0" />
            {loading === 'start' ? 'Starting…' : 'Start Now'}
          </button>

          <button
            onClick={handleGateway}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-opacity hover:opacity-85"
            style={{ background: 'var(--color-sky)', color: 'var(--color-sky-text)' }}
          >
            <Send className="w-4 h-4 flex-shrink-0" />
            Send to Gateway
          </button>

          <button
            onClick={() => void handleDefer()}
            disabled={!item.taskId || loading !== null}
            className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-opacity hover:opacity-85 disabled:opacity-40"
            style={{ background: 'var(--muted)', color: 'var(--muted-foreground)' }}
          >
            <Clock className="w-4 h-4 flex-shrink-0" />
            {loading === 'defer' ? 'Deferring…' : 'Defer for Later'}
          </button>
        </div>
      </div>
    </div>
  );
}
