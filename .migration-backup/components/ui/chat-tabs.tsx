'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  onPinsUpdated,
  onTitlesUpdated,
  readPinned,
  readTitles,
  writePinned,
  sessionsKey,
  writeTitles,
} from '@/lib/chat/tabs-client';
import { Pin } from 'lucide-react';

type ChatTabsProps = {
  agent: string;
  sessionId: string | null;
  onSessionChange: (sessionId: string) => void;
  onSessionClose?: (sessionId: string) => void;
  className?: string;
  showSearch?: boolean;
};

type SessionMessage = {
  role?: string;
  content?: string;
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

function readStoredSessions(agent: string): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(sessionsKey(agent)) ?? '[]');
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

export function ChatTabs({
  agent,
  sessionId,
  onSessionChange,
  onSessionClose,
  className,
  showSearch = false,
}: ChatTabsProps) {
  const storageKey = useMemo(() => sessionsKey(agent), [agent]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [pinned, setPinned] = useState<string[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [messageIndex, setMessageIndex] = useState<Record<string, string>>({});
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Hydrate from localStorage
  useEffect(() => {
    setSessions(readStoredSessions(agent));
    setTitles(readTitles(agent));
    setPinned(readPinned(agent));
  }, [agent]);

  // Listen for title updates dispatched by pages (auto-title after first send,
  // renames from other windows/tabs).
  useEffect(() => {
    return onTitlesUpdated(agent, () => setTitles(readTitles(agent)));
  }, [agent]);

  useEffect(() => {
    return onPinsUpdated(agent, () => setPinned(readPinned(agent)));
  }, [agent]);

  // Pull recent sessions from the server so other devices' tabs show up here,
  // and fill in titles and previews for our local tabs.
  useEffect(() => {
    let cancelled = false;

    const merge = async () => {
      try {
        const res = await fetch(`/api/chat/sessions?agent=${encodeURIComponent(agent)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        const remote: Array<{ id: string; title: string | null }> = data?.sessions ?? [];
        if (cancelled) return;

        const remoteValid = remote.filter((s) => isValidSessionId(agent, s.id));

        // Merge tab list — prepend any server IDs we don't have locally.
        setSessions((prev) => {
          const seen = new Set(prev);
          const mergedRemote = remoteValid.map((s) => s.id).filter((id) => !seen.has(id));
          if (mergedRemote.length === 0) return prev;
          return [...prev, ...mergedRemote].slice(0, MAX_SESSIONS);
        });

        // Merge titles — server wins if local has none; don't clobber local renames.
        setTitles((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const s of remoteValid) {
            if (s.title && !next[s.id]) {
              next[s.id] = s.title;
              changed = true;
            }
          }
          if (changed) writeTitles(agent, next);
          return changed ? next : prev;
        });
      } catch {
        // ignore
      }
    };

    merge();
    return () => {
      cancelled = true;
    };
  }, [agent]);

  // Ensure there's an active session
  useEffect(() => {
    setSessions((prev) => {
      if (isValidSessionId(agent, sessionId)) {
        if (prev.includes(sessionId)) return prev;
        return [sessionId, ...prev].slice(0, MAX_SESSIONS);
      }

      if (prev.length > 0) {
        onSessionChange(prev[0]);
        return prev;
      }
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

  useEffect(() => {
    if (renamingId) renameInputRef.current?.select();
  }, [renamingId]);

  const createSession = useCallback(() => {
    const created = createSessionId(agent);
    setSessions((prev) => [created, ...prev].slice(0, MAX_SESSIONS));
    onSessionChange(created);
  }, [agent, onSessionChange]);

  const dropTitle = useCallback(
    (id: string) => {
      setTitles((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        writeTitles(agent, next);
        return next;
      });
    },
    [agent]
  );

  const closeSession = useCallback(
    (toClose: string, opts: { deleteRemote?: boolean } = {}) => {
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
      dropTitle(toClose);
      if (opts.deleteRemote) {
        fetch(`/api/chat/sessions/${encodeURIComponent(toClose)}`, { method: 'DELETE' }).catch(() => {});
      }
    },
    [agent, dropTitle, onSessionChange, onSessionClose, sessionId]
  );

  const togglePin = useCallback((id: string) => {
    setPinned((prev) => {
      const next = prev.includes(id) ? prev.filter((item) => item !== id) : [id, ...prev];
      writePinned(agent, next);
      return next;
    });
  }, [agent]);

  const handleCloseClick = useCallback(
    (id: string, e: React.MouseEvent) => {
      const destructive = e.shiftKey || e.altKey;
      if (destructive) {
        const name = titles[id] ?? 'this session';
        if (!window.confirm(`Permanently delete "${name}" and all its messages?`)) return;
      }
      closeSession(id, { deleteRemote: destructive });
    },
    [closeSession, titles]
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
      dropTitle(id);
      return;
    }
    setTitles((prev) => {
      const next = { ...prev, [id]: trimmed };
      writeTitles(agent, next);
      return next;
    });
    fetch(`/api/chat/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: trimmed }),
    }).catch(() => {});
  }, [agent, dropTitle, renameValue, renamingId]);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue('');
  }, []);

  const visibleSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;

    const matched = sessions.filter((id) => {
      const title = titles[id] ?? '';
      const haystack = `${id} ${title} ${messageIndex[id] ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });

    if (sessionId && sessions.includes(sessionId) && !matched.includes(sessionId)) {
      return [sessionId, ...matched];
    }

    return matched;
  }, [searchQuery, sessions, sessionId, titles, messageIndex]);

  const orderedSessions = useMemo(() => {
    const index = new Map<string, number>(sessions.map((id, i) => [id, i]));
    return [...visibleSessions].sort((a, b) => {
      const aPinned = pinned.includes(a) ? 0 : 1;
      const bPinned = pinned.includes(b) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      return (index.get(a) ?? 0) - (index.get(b) ?? 0);
    });
  }, [pinned, sessions, visibleSessions]);

  useEffect(() => {
    let cancelled = false;

    const syncSearchIndex = async () => {
      const q = searchQuery.trim();
      if (!q) {
        setMessageIndex({});
        setSearching(false);
        return;
      }

      setSearching(true);
      try {
        const ids = sessions.slice(0, MAX_SESSIONS);
        const pairs = await Promise.all(
          ids.map(async (id) => {
            try {
              const res = await fetch(`/api/chat/messages?sessionId=${encodeURIComponent(id)}`, {
                cache: 'no-store',
              });
              if (!res.ok) return [id, ''] as const;
              const data = await res.json();
              const messages: SessionMessage[] = Array.isArray(data?.messages) ? data.messages : [];
              const indexed = messages
                .map((message) => `${message.role ?? ''} ${message.content ?? ''}`)
                .join(' ')
                .slice(0, 12000);
              return [id, indexed] as const;
            } catch {
              return [id, ''] as const;
            }
          })
        );

        if (cancelled) return;
        setMessageIndex(Object.fromEntries(pairs));
      } finally {
        if (!cancelled) setSearching(false);
      }
    };

    void syncSearchIndex();

    return () => {
      cancelled = true;
    };
  }, [searchQuery, sessions]);

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        width: '100%',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          flexWrap: 'wrap',
        }}
      >
        {showSearch && (
          <div style={{ minWidth: 180, flex: '1 1 180px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions"
              aria-label="Search sessions"
              style={{
                minWidth: 0,
                flex: 1,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(255,255,255,0.04)',
                color: 'white',
                padding: '7px 11px',
                fontSize: 12,
                outline: 'none',
              }}
            />
            {searching && (
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace' }}>
                searching…
              </span>
            )}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            flex: '1 1 100%',
            paddingBottom: 2,
          }}
        >
        {orderedSessions.map((id, index) => {
          const active = id === sessionId;
          const customTitle = titles[id];
          const label = customTitle && customTitle.trim() ? customTitle : `Session ${index + 1}`;
          const isRenaming = renamingId === id;
          const isPinned = pinned.includes(id);

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
                onClick={() => togglePin(id)}
                aria-label={isPinned ? `Unpin ${label}` : `Pin ${label}`}
                title={isPinned ? `Unpin ${label}` : `Pin ${label}`}
                style={{
                  border: 'none',
                  borderLeft: '1px solid rgba(255,255,255,0.14)',
                  background: isPinned ? 'rgba(56,184,218,0.16)' : 'transparent',
                  color: isPinned ? '#38b8da' : 'rgba(255,255,255,0.55)',
                  width: 30,
                  height: 28,
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                <Pin className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => handleCloseClick(id, e)}
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
                title={`Close ${label} (shift-click to delete permanently)`}
              >
                ×
              </button>
            </div>
          );
        })}
        </div>
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
