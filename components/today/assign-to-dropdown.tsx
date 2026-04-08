'use client';

import { useEffect, useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { ALL_BOTS, BOT_COLORS } from '@/lib/constants/today';

interface AssignToDropdownProps {
  currentBot?: string;
  taskTitle: string;
  onAssign: (bot: string) => void;
}

export function AssignToDropdown({ currentBot, taskTitle: _taskTitle, onAssign }: AssignToDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="rounded-lg px-2 py-1 text-[11px] font-medium hover:opacity-80 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'var(--color-lavender)', color: 'var(--color-lavender-text)' }}
      >
        <UserPlus className="w-3 h-3" /> Assign
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 rounded-xl shadow-lg overflow-hidden min-w-[140px]"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          {ALL_BOTS.filter((b) => b !== currentBot).map((bot) => {
            const c = BOT_COLORS[bot] ?? BOT_COLORS.Adrian;
            return (
              <button
                key={bot}
                onClick={() => { onAssign(bot); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-xs font-medium hover:opacity-80 flex items-center gap-2 transition-all"
                style={{ color: 'var(--foreground)' }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.text }} />
                {bot}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
