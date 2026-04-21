'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Route = any;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  href: string;
  section: 'Navigation' | 'Quick Actions' | 'Bots';
}

// ---------------------------------------------------------------------------
// Command data
// ---------------------------------------------------------------------------

const NAV_ITEMS: CommandItem[] = [
  { id: 'nav-today',    label: 'Today',    href: '/today',    section: 'Navigation' },
  { id: 'nav-tasks',    label: 'Tasks',    href: '/tasks',    section: 'Navigation' },
  { id: 'nav-email',    label: 'Email',    href: '/email',    section: 'Navigation' },
  { id: 'nav-finance',  label: 'Finance',  href: '/finance',  section: 'Navigation' },
  { id: 'nav-vision',   label: 'Vision',   href: '/vision',   section: 'Navigation' },
  { id: 'nav-dispatch', label: 'Dispatch', href: '/dispatch', section: 'Navigation' },
  { id: 'nav-projects', label: 'Projects', href: '/projects', section: 'Navigation' },
  { id: 'nav-bots',     label: 'Bots',     href: '/bots',     section: 'Navigation' },
  { id: 'nav-activity', label: 'Activity', href: '/activity', section: 'Navigation' },
];

const ACTION_ITEMS: CommandItem[] = [
  { id: 'action-new-task',     label: 'New Task',      description: 'Open tasks page',     href: '/tasks',        section: 'Quick Actions' },
  { id: 'action-new-campaign', label: 'New Campaign',  description: 'Start a campaign',     href: '/dispatch?new=1', section: 'Quick Actions' },
  { id: 'action-draft-reply',  label: 'Draft Reply',   description: 'Open email inbox',     href: '/email',        section: 'Quick Actions' },
  { id: 'action-ask-drizzy',   label: 'Ask Drizzy',    description: 'Chat with Drizzy',     href: '/ruby',         section: 'Quick Actions' },
];

const BOT_ITEMS: CommandItem[] = [
  { id: 'bot-drake',     label: 'Message Drake',          description: 'Open Bots',  href: '/bots', section: 'Bots' },
  { id: 'bot-drizzy',   label: 'Message Drizzy',          description: 'Open Bots',  href: '/bots', section: 'Bots' },
  { id: 'bot-champagne', label: 'Message Champagne Papi', description: 'Open Bots',  href: '/bots', section: 'Bots' },
];

const ALL_ITEMS: CommandItem[] = [...NAV_ITEMS, ...ACTION_ITEMS, ...BOT_ITEMS];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matches(item: CommandItem, query: string): boolean {
  const q = query.toLowerCase();
  return (
    item.label.toLowerCase().includes(q) ||
    (item.description?.toLowerCase().includes(q) ?? false)
  );
}

function filterItems(query: string): CommandItem[] {
  if (!query.trim()) {
    // Show everything when empty
    return ALL_ITEMS;
  }
  return ALL_ITEMS.filter((item) => matches(item, query));
}

// Group into sections, preserving order
function groupBySections(items: CommandItem[]): { section: string; items: CommandItem[] }[] {
  const map = new Map<string, CommandItem[]>();
  const order = ['Navigation', 'Quick Actions', 'Bots'];

  for (const item of items) {
    if (!map.has(item.section)) map.set(item.section, []);
    map.get(item.section)!.push(item);
  }

  return order.flatMap((section) => {
    const sectionItems = map.get(section);
    if (!sectionItems || sectionItems.length === 0) return [];
    return [{ section, items: sectionItems }];
  });
}

// ---------------------------------------------------------------------------
// Section label icons (simple text badges)
// ---------------------------------------------------------------------------

const SECTION_ICONS: Record<string, string> = {
  Navigation: '⌘',
  'Quick Actions': '⚡',
  Bots: '🤖',
};

// ---------------------------------------------------------------------------
// CommandPalette component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const filtered = filterItems(query);
  const groups = groupBySections(filtered);

  // Flatten for keyboard nav
  const flatItems = groups.flatMap((g) => g.items);

  const handleOpen = useCallback(() => {
    setOpen(true);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const handleSelect = useCallback(
    (item: CommandItem) => {
      handleClose();
      router.push(item.href as Route);
    },
    [handleClose, router]
  );

  // Global keyboard listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (open) {
          handleClose();
        } else {
          handleOpen();
        }
        return;
      }

      if (!open) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % Math.max(flatItems.length, 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + Math.max(flatItems.length, 1)) % Math.max(flatItems.length, 1));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const item = flatItems[selectedIndex];
        if (item) handleSelect(item);
        return;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, flatItems, selectedIndex, handleOpen, handleClose, handleSelect]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      // Tiny delay so the element is mounted and visible
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  return (
    /* Full-screen overlay */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => {
        // Close when clicking the backdrop, not the modal itself
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Modal */}
      <div
        className="w-full max-w-lg rounded-2xl overflow-hidden flex flex-col"
        style={{
          background: '#0A1628',
          border: '1px solid rgba(0,217,255,0.2)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
          maxHeight: '70vh',
        }}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid rgba(0,217,255,0.12)' }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="flex-shrink-0"
            style={{ color: 'rgba(0,217,255,0.5)' }}
          >
            <path
              d="M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10ZM14 14l-2.9-2.9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search or type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: '#E8EDF5', caretColor: '#00D9FF' }}
          />
          <kbd
            className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px]"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto py-2" style={{ overscrollBehavior: 'contain' }}>
          {groups.length === 0 && (
            <p
              className="text-center text-sm py-8"
              style={{ color: 'rgba(255,255,255,0.35)' }}
            >
              No results for &ldquo;{query}&rdquo;
            </p>
          )}

          {groups.map(({ section, items }) => {
            return (
              <div key={section}>
                {/* Section header */}
                <div
                  className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] uppercase tracking-widest"
                  style={{ color: 'rgba(0,217,255,0.5)' }}
                >
                  <span>{SECTION_ICONS[section]}</span>
                  <span>{section}</span>
                </div>

                {/* Items */}
                {items.map((item) => {
                  const globalIdx = flatItems.indexOf(item);
                  const isSelected = globalIdx === selectedIndex;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                      style={{
                        background: isSelected ? 'rgba(0,217,255,0.1)' : 'transparent',
                        borderLeft: isSelected ? '2px solid #00D9FF' : '2px solid transparent',
                        color: '#E8EDF5',
                      }}
                      onMouseEnter={() => setSelectedIndex(globalIdx)}
                      onClick={() => handleSelect(item)}
                    >
                      <span className="flex-1 text-sm font-medium">{item.label}</span>
                      {item.description && (
                        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                          {item.description}
                        </span>
                      )}
                      <span
                        className="text-[10px] ml-2"
                        style={{ color: 'rgba(255,255,255,0.2)' }}
                      >
                        {item.href.split('?')[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div
          className="flex items-center gap-3 px-4 py-2 text-[10px]"
          style={{
            borderTop: '1px solid rgba(0,217,255,0.08)',
            color: 'rgba(255,255,255,0.25)',
          }}
        >
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
          <span className="ml-auto opacity-60">⌘K</span>
        </div>
      </div>
    </div>
  );
}
