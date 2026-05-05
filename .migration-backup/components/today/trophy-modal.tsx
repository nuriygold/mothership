'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Trophy, X, CheckCircle2, Award, Sparkles, RotateCcw } from 'lucide-react';

type TrophyData = {
  since: string;
  totals: { tasks: number; commands: number; events: number };
  tasks: Array<{ id: string; title: string; priority: string; completedAt: string }>;
  commands: Array<{ id: string; input: string; channel: string; completedAt: string | null }>;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface TrophyModalProps {
  onClose: () => void;
  localCompletions: string[];
  completedIds: Set<string>;
  onUndoTask: (taskId: string) => void;
}

export function TrophyModal({ onClose, localCompletions, completedIds, onUndoTask }: TrophyModalProps) {
  const { data, isLoading } = useSWR<TrophyData>('/api/v2/trophy?mode=day', fetcher, { revalidateOnMount: true });

  // Restore focus to the element that opened the modal
  const previousFocusRef = useRef<Element | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    closeBtnRef.current?.focus();
    return () => {
      (previousFocusRef.current as HTMLElement | null)?.focus();
    };
  }, []);

  // Escape key closes the modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

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
      role="dialog"
      aria-modal="true"
      aria-labelledby="trophy-modal-title"
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
            <h2 id="trophy-modal-title" className="text-base font-semibold" style={{ color: '#0F1B35' }}>Trophy Collection</h2>
            <p className="text-xs" style={{ color: '#92400E' }}>
              {isLoading ? 'Loading…' : `${total} win${total !== 1 ? 's' : ''} in the last 24 hours`}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label="Close trophy modal"
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
                {allTasks.map((task) => {
                  const isLocallyDone = task.id.startsWith('local-') ? completedIds.size > 0 : completedIds.has(task.id);
                  void isLocallyDone;
                  return (
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
                      {!task.id.startsWith('local-') && (
                        <button
                          onClick={() => { onUndoTask(task.id); onClose(); }}
                          className="rounded-xl px-2 py-1 text-[10px] font-medium flex items-center gap-1 flex-shrink-0 hover:opacity-80 transition-opacity"
                          style={{ background: 'rgba(0,0,0,0.08)', color: '#0F1B35' }}
                          title="Mark as not done"
                        >
                          <RotateCcw className="w-2.5 h-2.5" /> Oops
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Commands */}
          {(data?.commands ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--muted-foreground)' }}>
                Gateway Commands · {data?.commands.length}
              </p>
              <div className="space-y-2">
                {data?.commands.map((cmd) => (
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
          <a
            href="/trophy"
            onClick={onClose}
            className="text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--color-cyan)' }}
          >
            View full history →
          </a>
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
