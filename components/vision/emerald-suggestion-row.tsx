'use client';

import type { V2VisionEmeraldSuggestion } from '@/lib/v2/types';

const ACTION_ICONS: Record<V2VisionEmeraldSuggestion['actionType'], string> = {
  campaign: '▶',
  finance_plan: '📈',
  task: '✓',
  note: '📝',
};

const ACTION_LABELS: Record<V2VisionEmeraldSuggestion['actionType'], string> = {
  campaign: 'Create campaign',
  finance_plan: 'Create plan',
  task: 'Add task',
  note: 'Note',
};

interface EmeraldSuggestionRowProps {
  suggestion: V2VisionEmeraldSuggestion;
  onAction: (suggestion: V2VisionEmeraldSuggestion) => void;
}

export function EmeraldSuggestionRow({ suggestion, onAction }: EmeraldSuggestionRowProps) {
  return (
    <div
      className="flex items-start justify-between gap-3 rounded-xl p-3"
      style={{ background: 'rgba(123,104,238,0.07)', border: '1px solid rgba(123,104,238,0.15)' }}
    >
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <span className="text-sm mt-0.5">{ACTION_ICONS[suggestion.actionType]}</span>
        <p className="text-sm leading-snug" style={{ color: 'var(--foreground)', opacity: 0.85 }}>
          {suggestion.text}
        </p>
      </div>
      <button
        onClick={() => onAction(suggestion)}
        className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-opacity hover:opacity-80"
        style={{ background: 'rgba(123,104,238,0.2)', color: '#7B68EE' }}
      >
        {ACTION_LABELS[suggestion.actionType]}
      </button>
    </div>
  );
}

interface EmeraldThinkingProps {
  label?: string;
}

export function EmeraldThinking({ label = 'Emerald is thinking…' }: EmeraldThinkingProps) {
  return (
    <div
      className="flex items-center gap-2 rounded-xl p-3"
      style={{ background: 'rgba(123,104,238,0.07)', border: '1px solid rgba(123,104,238,0.15)' }}
    >
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: '#7B68EE',
              animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
            }}
          />
        ))}
      </div>
      <span className="text-xs" style={{ color: '#7B68EE' }}>{label}</span>
    </div>
  );
}
