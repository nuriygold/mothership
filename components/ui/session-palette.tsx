'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type SessionRow = {
  id: string;
  title: string | null;
  lastMessage: string | null;
  updatedAt: string;
};

type Props = {
  agent: string;
  onSelect: (sessionId: string) => void;
};

function formatAgo(ts: string | null | undefined): string {
  if (!ts) return '';
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function SessionPalette({ agent, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl+K toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Fetch when opened
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/chat/sessions?agent=${encodeURIComponent(agent)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const list: SessionRow[] = Array.isArray(data?.sessions) ? data.sessions : [];
        setSessions(list);
        setHighlighted(0);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agent, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery('');
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      const hay = `${s.title ?? ''} ${s.lastMessage ?? ''} ${s.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, query]);

  const pick = useCallback(
    (row: SessionRow) => {
      onSelect(row.id);
      setOpen(false);
    },
    [onSelect]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((n) => Math.min(filtered.length - 1, n + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((n) => Math.max(0, n - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = filtered[highlighted];
      if (row) pick(row);
    }
  };

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5,8,14,0.72)',
        backdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 92vw)',
          background: '#0f1320',
          border: '1px solid #2a2f45',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          overflow: 'hidden',
          fontFamily: 'inherit',
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlighted(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Jump to session… (title, message, id)"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '14px 16px',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid #1e2235',
            color: 'white',
            fontSize: 14,
            outline: 'none',
          }}
        />
        <div style={{ maxHeight: '56vh', overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: '16px', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              Loading…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: '16px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>
              No sessions match.
            </div>
          )}
          {filtered.map((row, i) => {
            const active = i === highlighted;
            const label = row.title?.trim() || `Untitled · ${row.id.slice(-6)}`;
            return (
              <button
                key={row.id}
                type="button"
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => pick(row)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 16px',
                  background: active ? 'rgba(56,184,218,0.12)' : 'transparent',
                  borderLeft: active ? '2px solid #38b8da' : '2px solid transparent',
                  border: 'none',
                  borderBottom: '1px solid #1a1e2c',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 13,
                    fontWeight: 500,
                  }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                    {formatAgo(row.updatedAt)}
                  </span>
                </div>
                {row.lastMessage && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.5)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.lastMessage}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid #1e2235',
            color: 'rgba(255,255,255,0.35)',
            fontSize: 11,
            fontFamily: 'monospace',
            display: 'flex',
            gap: 16,
          }}
        >
          <span>↑↓ navigate</span>
          <span>⏎ open</span>
          <span>esc close</span>
          <span style={{ flex: 1 }} />
          <span>⌘K</span>
        </div>
      </div>
    </div>
  );
}
