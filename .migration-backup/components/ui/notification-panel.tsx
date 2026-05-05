'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import Link from 'next/link';
import { Bell } from 'lucide-react';

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
};

const NOTIF_URL = '/api/v2/notifications';
const fetcher = (url: string) => fetch(url).then((r) => r.json());

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data, mutate } = useSWR<{ notifications: Notification[]; unread: number }>(
    NOTIF_URL,
    fetcher,
    { refreshInterval: 60_000 }
  );

  // SSE: revalidate on new notification or read event
  useEffect(() => {
    const es = new EventSource('/api/v2/stream/notifications');
    const handler = () => { mutate(); };
    es.addEventListener('new', handler);
    es.addEventListener('read', handler);
    return () => es.close();
  }, [mutate]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markAllRead = useCallback(async () => {
    await fetch('/api/v2/notifications/read', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    mutate();
  }, [mutate]);

  const markRead = useCallback(async (id: string) => {
    await fetch('/api/v2/notifications/read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    mutate();
  }, [mutate]);

  const unread = data?.unread ?? 0;
  const notifications = data?.notifications ?? [];

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        className="rounded-lg border p-2 transition-opacity hover:opacity-80"
        style={{
          borderColor: '#b8e0f5',
          color: 'var(--ice-text3)',
          background: 'rgba(255,255,255,0.8)',
          position: 'relative',
        }}
      >
        <Bell className="w-3.5 h-3.5" />
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              background: 'var(--green)',
              color: '#fff',
              borderRadius: '50%',
              fontSize: 9,
              fontWeight: 700,
              width: 14,
              height: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 320,
            maxHeight: 440,
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(12px)',
            border: '1px solid #b8e0f5',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(64,168,200,0.15)',
            zIndex: 200,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid #ddf0fa',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ice-text)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Notifications
            </span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{ fontSize: 11, color: 'var(--green)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--ice-text3)', fontStyle: 'italic' }}>
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => {
                const inner = (
                  <div
                    key={n.id}
                    onClick={() => !n.read && markRead(n.id)}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid #eef7fc',
                      cursor: n.read ? 'default' : 'pointer',
                      background: n.read ? 'transparent' : 'rgba(64,200,240,0.04)',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: n.read ? 'transparent' : 'var(--green)',
                        flexShrink: 0,
                        marginTop: 5,
                      }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: n.read ? 400 : 600, color: 'var(--ice-text)', lineHeight: 1.4 }}>
                        {n.title}
                      </div>
                      {n.body && (
                        <div style={{ fontSize: 11, color: 'var(--ice-text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {n.body}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--ice-text3)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
                        {timeAgo(n.createdAt)}
                      </div>
                    </div>
                  </div>
                );

                return n.href ? (
                  <Link key={n.id} href={n.href as any} onClick={() => { markRead(n.id); setOpen(false); }} style={{ textDecoration: 'none', display: 'block' }}>
                    {inner}
                  </Link>
                ) : (
                  <div key={n.id}>{inner}</div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
