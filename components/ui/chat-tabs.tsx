'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

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

export function ChatTabs({
  agent,
  sessionId,
  onSessionChange,
  onSessionClose,
  className,
}: ChatTabsProps) {
  const storageKey = useMemo(() => `chat-tabs:${agent}:sessions`, [agent]);
  const [sessions, setSessions] = useState<string[]>([]);

  useEffect(() => {
    const stored = readStoredSessions(storageKey, agent);
    setSessions(stored);
  }, [agent, storageKey]);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(sessions));
  }, [sessions, storageKey]);

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
    },
    [agent, onSessionChange, onSessionClose, sessionId]
  );

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
          const label = `Session ${index + 1}`;

          return (
            <div
              key={id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                maxWidth: 240,
                borderRadius: 999,
                border: active ? '1px solid rgba(255,255,255,0.35)' : '1px solid rgba(255,255,255,0.18)',
                background: active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.03)',
                color: 'white',
                fontSize: 12,
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={() => onSessionChange(id)}
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
                title={id}
              >
                {label}
              </button>
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
