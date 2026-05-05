'use client';

import { useState, useEffect } from 'react';
import { X, Plus, ChevronDown } from 'lucide-react';
import type { VisionItemStatus, V2TaskItem, V2TasksFeed } from '@/lib/v2/types';

interface AddItemModalProps {
  pillarId: string;
  pillarLabel: string;
  onClose: () => void;
  onCreated: () => void;
}

const STATUS_OPTIONS: VisionItemStatus[] = ['DREAMING', 'ACTIVE', 'ACHIEVED', 'ON_HOLD'];
const STATUS_LABELS: Record<VisionItemStatus, string> = {
  DREAMING: 'Dreaming',
  ACTIVE: 'Active',
  ACHIEVED: 'Achieved',
  ON_HOLD: 'On Hold',
};

const COMMON_EMOJIS = ['🎯', '🚀', '💡', '🌟', '🏆', '💪', '🌈', '🔥', '✨', '🎨', '💰', '🏠', '❤️', '🌱'];

export function AddItemModal({ pillarId, pillarLabel, onClose, onCreated }: AddItemModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<VisionItemStatus>('DREAMING');
  const [imageEmoji, setImageEmoji] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [poolTasks, setPoolTasks] = useState<V2TaskItem[]>([]);
  const [poolTasksLoading, setPoolTasksLoading] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (!showTaskPicker || poolTasks.length > 0) return;
    setPoolTasksLoading(true);
    fetch('/api/v2/tasks')
      .then(r => r.json())
      .then((data: V2TasksFeed) => {
        const all = [...(data.active ?? []), ...(data.today ?? []), ...(data.backlog ?? [])];
        setPoolTasks(all);
      })
      .catch(() => setPoolTasks([]))
      .finally(() => setPoolTasksLoading(false));
  }, [showTaskPicker, poolTasks.length]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/vision/pillars/${pillarId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          imageEmoji: imageEmoji || undefined,
          targetDate: targetDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? 'Failed to create item');
      }
      const { item } = data;
      if (selectedTaskId && item?.id) {
        await fetch(`/api/v2/vision/items/${item.id}/link-task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: selectedTaskId }),
        });
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl p-6 shadow-2xl"
        style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-base" style={{ color: 'var(--foreground)' }}>
            Add goal to {pillarLabel}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ background: 'var(--muted)' }}
          >
            <X className="w-4 h-4" style={{ color: 'var(--foreground)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Emoji picker row */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--foreground)', opacity: 0.6 }}>
              Icon (optional)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setImageEmoji(imageEmoji === e ? '' : e)}
                  className="w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all"
                  style={{
                    background: imageEmoji === e ? 'var(--color-cyan)' : 'var(--muted)',
                    transform: imageEmoji === e ? 'scale(1.15)' : 'scale(1)',
                  }}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--foreground)', opacity: 0.6 }}>
              Goal *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What do you want to achieve?"
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{
                background: 'var(--muted)',
                border: '1px solid var(--card-border)',
                color: 'var(--foreground)',
              }}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--foreground)', opacity: 0.6 }}>
              Description (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Why does this matter to you?"
              rows={3}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
              style={{
                background: 'var(--muted)',
                border: '1px solid var(--card-border)',
                color: 'var(--foreground)',
              }}
            />
          </div>

          {/* Status + Target Date row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--foreground)', opacity: 0.6 }}>
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as VisionItemStatus)}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{
                  background: 'var(--muted)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--foreground)',
                }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--foreground)', opacity: 0.6 }}>
                Target date
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                style={{
                  background: 'var(--muted)',
                  border: '1px solid var(--card-border)',
                  color: 'var(--foreground)',
                }}
              />
            </div>
          </div>

          {/* Link a task */}
          <div>
            <button
              type="button"
              onClick={() => setShowTaskPicker(v => !v)}
              className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--foreground)', opacity: 0.6 }}
            >
              <Plus className="w-3.5 h-3.5" />
              Link a task from pool
              <ChevronDown
                className="w-3.5 h-3.5 transition-transform"
                style={{ transform: showTaskPicker ? 'rotate(180deg)' : 'none' }}
              />
            </button>

            {selectedTaskId && !showTaskPicker && (
              <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--muted)', border: '1px solid var(--card-border)' }}>
                <p className="flex-1 text-xs truncate" style={{ color: 'var(--foreground)' }}>
                  {poolTasks.find(t => t.taskId === selectedTaskId)?.title ?? selectedTaskId}
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedTaskId(null)}
                  className="opacity-40 hover:opacity-70 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" style={{ color: 'var(--foreground)' }} />
                </button>
              </div>
            )}

            {showTaskPicker && (
              <div className="mt-2 flex flex-col gap-2 rounded-xl p-3" style={{ background: 'var(--muted)', border: '1px solid var(--card-border)' }}>
                <input
                  type="text"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  placeholder="Search tasks…"
                  className="rounded-lg px-3 py-2 text-sm outline-none w-full"
                  style={{ background: 'var(--card)', border: '1px solid var(--card-border)', color: 'var(--foreground)' }}
                />
                <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                  {poolTasksLoading && (
                    <p className="text-xs text-center py-3" style={{ color: 'var(--foreground)', opacity: 0.4 }}>Loading…</p>
                  )}
                  {!poolTasksLoading && poolTasks.length === 0 && (
                    <p className="text-xs text-center py-3" style={{ color: 'var(--foreground)', opacity: 0.4 }}>
                      No vision board tasks found
                    </p>
                  )}
                  {!poolTasksLoading && poolTasks
                    .filter(t => !taskSearch || t.title.toLowerCase().includes(taskSearch.toLowerCase()))
                    .map(t => (
                      <button
                        key={t.taskId}
                        type="button"
                        onClick={() => { setSelectedTaskId(t.taskId === selectedTaskId ? null : t.taskId); setShowTaskPicker(false); }}
                        className="flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-opacity hover:opacity-80"
                        style={{
                          background: selectedTaskId === t.taskId ? 'var(--color-cyan)' : 'var(--card)',
                          border: '1px solid var(--card-border)',
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate" style={{ color: selectedTaskId === t.taskId ? '#0A0E1A' : 'var(--foreground)' }}>
                            {t.title}
                          </p>
                          <p className="text-[10px] mt-0.5" style={{ color: selectedTaskId === t.taskId ? '#0A0E1A' : 'var(--foreground)', opacity: 0.55 }}>
                            {t.status} · {t.metadata.priority}
                          </p>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full py-2.5 text-sm font-medium transition-opacity hover:opacity-70"
              style={{ background: 'var(--muted)', color: 'var(--foreground)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              className="flex-1 rounded-full py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
              style={{ background: 'var(--color-cyan)', color: '#0A0E1A' }}
            >
              {saving ? 'Saving…' : 'Add goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
