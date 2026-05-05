'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

type NewTaskModalProps = {
  onClose: () => void;
  onSuccess: () => void;
};

export function NewTaskModal({ onClose, onSuccess }: NewTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/v2/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Failed to create task');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <div
        className="rounded-3xl p-6 max-w-md w-full"
        style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--foreground)' }}>
            New Task
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:opacity-60 transition-opacity"
            aria-label="Close"
          >
            <X className="w-5 h-5" style={{ color: 'var(--muted-foreground)' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium mb-1"
              style={{ color: 'var(--foreground)' }}
            >
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
              autoFocus
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium mb-1"
              style={{ color: 'var(--foreground)' }}
            >
              Description (optional)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add more details..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm resize-none"
              style={{
                background: 'var(--background)',
                border: '1px solid var(--border)',
                color: 'var(--foreground)',
              }}
              disabled={isSubmitting}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: 'var(--destructive)' }}>
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-full text-sm font-medium"
              style={{ border: '1px solid var(--border)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-full text-sm font-medium"
              style={{ background: 'var(--color-cyan)', color: '#fff' }}
            >
              {isSubmitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
