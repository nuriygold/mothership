'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { LiveRuby } from '@/components/today/live-ruby';
import { ChatTabs } from '@/components/ui/chat-tabs';

const RUBY_ACTIVE_SESSION_KEY = 'ruby-active-session';
const RUBY_SESSIONS_KEY = 'ruby-sessions-v2';

type LocalRubySession = {
  id: string;
  title: string | null;
  lastMessage: string | null;
  updatedAt: string;
};

function isRubySessionId(value: string | null | undefined): value is string {
  if (!value) return false;
  return /^agent:ruby:[0-9a-fA-F-]{36}$/.test(value);
}

function ensureRubySession(sessionId: string) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(RUBY_ACTIVE_SESSION_KEY, sessionId);
  const now = new Date().toISOString();

  let sessions: LocalRubySession[] = [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RUBY_SESSIONS_KEY) ?? '[]');
    sessions = Array.isArray(parsed) ? parsed : [];
  } catch {
    sessions = [];
  }

  if (!sessions.some((session) => session?.id === sessionId)) {
    const next = [{ id: sessionId, title: null, lastMessage: null, updatedAt: now }, ...sessions].slice(0, 50);
    window.localStorage.setItem(RUBY_SESSIONS_KEY, JSON.stringify(next));
  }

  fetch('/api/v2/ruby/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: sessionId }),
  }).catch(() => {});
}

function removeRubySession(sessionId: string) {
  if (typeof window === 'undefined') return;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(RUBY_SESSIONS_KEY) ?? '[]');
    const sessions = Array.isArray(parsed) ? parsed : [];
    const next = sessions.filter((session: LocalRubySession) => session?.id !== sessionId);
    window.localStorage.setItem(RUBY_SESSIONS_KEY, JSON.stringify(next));
  } catch {}

  fetch(`/api/v2/ruby/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => {});
}

function RubyPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialPrefill = searchParams?.get('q') ?? '';
  const [prefill, setPrefill] = useState(initialPrefill);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const updateUrlSession = useCallback(
    (nextSessionId: string) => {
      const nextParams = new URLSearchParams(searchParams?.toString() ?? '');
      nextParams.set('session', nextSessionId);
      const nextUrl = `${pathname}?${nextParams.toString()}`;
      router.replace(nextUrl as never);
    },
    [pathname, router, searchParams]
  );

  const handleSessionChange = useCallback(
    (nextSessionId: string) => {
      ensureRubySession(nextSessionId);
      setSessionId(nextSessionId);
      updateUrlSession(nextSessionId);
    },
    [updateUrlSession]
  );

  const handleSessionClose = useCallback((closedSessionId: string) => {
    removeRubySession(closedSessionId);
  }, []);

  useEffect(() => {
    const sessionFromQuery = searchParams?.get('session') ?? null;
    if (isRubySessionId(sessionFromQuery)) {
      ensureRubySession(sessionFromQuery);
      setSessionId(sessionFromQuery);
      return;
    }

    setSessionId(null);
  }, [searchParams]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
        <ChatTabs
          agent="ruby"
          sessionId={sessionId}
          onSessionChange={handleSessionChange}
          onSessionClose={handleSessionClose}
        />
      </div>
      <div className="flex-1 min-h-0">
        {sessionId ? (
          <LiveRuby
            key={sessionId}
            prefill={prefill}
            onPrefillConsumed={() => setPrefill('')}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm" style={{ color: 'var(--muted-foreground)' }}>
            Initializing session…
          </div>
        )}
      </div>
    </div>
  );
}

export default function RubyPage() {
  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden"
      style={{
        height: 'calc(100vh - 80px)',
        border: '1px solid var(--border)',
        background: 'var(--card)',
      }}
    >
      <Suspense
        fallback={
          <div className="flex-1 animate-pulse rounded-2xl" style={{ background: 'var(--muted)' }} />
        }
      >
        <RubyPageContent />
      </Suspense>
    </div>
  );
}
