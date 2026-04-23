'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type ChatTabsProps = {
  agent: string;
  sessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onSessionClose?: (sessionId: string) => void;
  className?: string;
};

const MAX_SESSIONS = 24;

function isValidSessionId(agent: string, sessionId: string | null): sessionId is string {
  if (!sessionId) return false;
  const pattern = new RegExp(`^agent:${agent}:[0-9a-fA-F-]{36}$`);
  return pattern.test(sessionId);
}

function createSessionId(agent: string): string {
  return `agent:${agent}:${crypto.randomUUID()}`;
}

function readStoredSessions(storageKey: string, agent: string): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(parsed)) return [];

    const unique = new Set<string>();
    for (const raw of parsed) {
      if (typeof raw !== 'string') continue;
      if (!isValidSessionId(agent, raw)) continue;
      unique.add(raw);
      if (unique.size >= MAX_SESSIONS) break;
    }

    return Array.from(unique);
  } catch {
    return [];
  }
}

function readStoredTitles(storageKey: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function ChatTabs({
  agent,
  sessionId,
  onSessionChange,
  onSessionClose,
  className,
}: ChatTabsProps) {
  const storageKey = useMemo(() => `chat-tabs:${agent}:sessions`, [agent]);
  const titlesKey = useMemo(() => `chat-tabs:${agent}:titles`, [agent]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const remoteSyncedRef = useRef(false);

  // Hydrate from localStorage
  useEffect(() => {
    setSessions(readStoredSessions(storageKey, agent));
    setTitles(readStoredTitles(titlesKey));
  }, [agent, storageKey, titlesKey]);

  // Pull titles & last-message previews for the loaded sessions from the server,
  // so renames performed in another window are reflected here too.
  useEffect(() => {
    if (!sessions.length || remoteSyncedRef.current) return;
    remoteSyncedRef.current = true;
    const ids = sessions.join(',');
    fetch(`/api/chat/sessions?ids=${encodeURIComponent(ids)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const list: Array<{ id: string; title: string | null }> = data?.sessions ?? [];
        if (!list.length) return;
        setTitles((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const s of list) {
            if (s.title && next[s.id] !== s.title) {
              next[s.id] = s.title;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      })
      .catch(() => {});
  }, [sessions]);

  // Ensure there's an active session
  useEffect(() => {
    setSessions((prev) => {
      if (isValidSessionId(agent, sessionId)) {
        if (prev.includes(sessionId)) return prev;
        return [sessionId, ...prev].slice(0, MAX_SESSIONS);
      }

      if (prev.length > 0) return prev;
      const created = createSessionId(agent);
      onSessionChange(created);
      return [created];
    });
  }, [agent, onSessionChange, sessionId]);

  // Persist tab list
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(sessions));
  }, [sessions, storageKey]);

  // Persist titles
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(titlesKey, JSON.stringify(titles));
  }, [titles, titlesKey]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.select();
  }, [renamingId]);

  const createSession = useCallback(() => {
    const created = createSessionId(agent);
    setSessions((prev) => [created, ...prev].slice(0, MAX_SESSIONS));
    onSessionChange(created);
  }, [agent, onSessionChange]);

  const closeSession = useCallback(
    (toClose: string) => {
      setSessions((prev) => {
        const idx = prev.indexOf(toClose);
        if (idx < 0) return prev;

        const next = prev.filter((id) => id !== toClose);
        if (next.length === 0) {
          const created = createSessionId(agent);
          onSessionChange(created);
          onSessionClose?.(toClose);
          return [created];
        }

        if (sessionId === toClose) {
          const nextActive = next[Math.max(0, idx - 1)] ?? next[0];
          onSessionChange(nextActive);
        }

        onSessionClose?.(toClose);
        return next;
      });
      setTitles((prev) => {
        if (!(toClose in prev)) return prev;
        const next = { ...prev };
        delete next[toClose];
        return next;
      });
    },
    [agent, onSessionChange, onSessionClose, sessionId]
  );

  const beginRename = useCallback(
    (id: string) => {
      setRenamingId(id);
      setRenameValue(titles[id] ?? '');
    },
    [titles]
  );

  const commitRename = useCallback(() => {
    if (!renamingId) return;
    const trimmed = renameValue.trim().slice(0, 80);
    const id = renamingId;
    setRenamingId(null);
    if (!trimmed) {
      // Clear the title (revert to default label) — local only.
      setTitles((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    setTitles((prev) => ({ ...prev, [id]: trimmed }));
    fetch(`/api/chat/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    }).catch(() => {});
  }, [renameValue, renamingId]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue('');
  }, []);

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          flex: 1,
          paddingBottom: 2,
        }}
      >
        {sessions.map((id, index) => {
          const active = id === sessionId;
          const customTitle = titles[id];
          const label = customTitle && customTitle.trim() ? customTitle : `Session ${index + 1}`;
          const isRenaming = renamingId === id;

          return (
            <div
              key={id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                maxWidth: 260,
                borderRadius: 999,
                border: active ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.18)',
                background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
                color: 'white',
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitRename();
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelRename();
                    }
                  }}
                  maxLength={80}
                  autoFocus
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'inherit',
                    padding: '7px 10px',
                    fontSize: 12,
                    outline: 'none',
                    width: 180,
                  }}
                  placeholder="Session name…"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSessionChange(id)}
                  onDoubleClick={() => beginRename(id)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'inherit',
                    padding: '7px 10px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    maxWidth: 190,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={`${label}\n${id}\nDouble-click to rename`}
                >
                  {label}
                </button>
              )}
              {!isRenaming && (
                <button
                  type="button"
                  onClick={() => beginRename(id)}
                  aria-label={`Rename ${label}`}
                  title={`Rename ${label}`}
                  style={{
                    border: 'none',
                    borderLeft: '1px solid rgba(255,255,255,0.14)',
                    background: 'transparent',
                    color: 'rgba(255,255,255,0.55)',
                    width: 26,
                    height: 28,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  ✎
                </button>
              )}
              <button
                type="button"
                onClick={() => closeSession(id)}
                style={{
                  border: 'none',
                  borderLeft: '1px solid rgba(255,255,255,0.14)',
                  background: 'transparent',
                  color: 'inherit',
                  width: 28,
                  height: 28,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
                aria-label={`Close ${label}`}
                title={`Close ${label}`}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={createSession}
        style={{
          border: '1px solid rgba(255,255,255,0.2)',
          background: 'rgba(255,255,255,0.06)',
          color: 'white',
          fontSize: 12,
          borderRadius: 999,
          padding: '7px 11px',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        + New
      </button>
    </div>
  );
}
