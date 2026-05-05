'use client';

import { useEffect, useRef, useState } from 'react';

type Status = 'checking' | 'up' | 'down';
type Snapshot = {
  status: Status;
  reason: string;
  latencyMs: number | null;
  lastChecked: number | null;
};

const POLL_MS = 15_000;
const TIMEOUT_MS = 8_000;

export function useGatewayStatus(endpoint = '/api/openclaw/health'): Snapshot {
  const [snap, setSnap] = useState<Snapshot>({
    status: 'checking',
    reason: 'Checking gateway…',
    latencyMs: null,
    lastChecked: null,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;

    const probe = async () => {
      const started = Date.now();
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(endpoint, { cache: 'no-store', signal: ctrl.signal });
        const latency = Date.now() - started;
        let reason = res.ok ? 'Gateway online' : `Gateway responded ${res.status}`;
        try {
          const data = await res.json();
          if (typeof data?.reason === 'string' && data.reason) reason = data.reason;
        } catch {}
        if (!alive) return;
        setSnap({
          status: res.ok ? 'up' : 'down',
          reason,
          latencyMs: latency,
          lastChecked: Date.now(),
        });
      } catch (err) {
        if (!alive) return;
        const isAbort = err instanceof DOMException && err.name === 'AbortError';
        setSnap({
          status: 'down',
          reason: isAbort ? `Gateway timed out after ${TIMEOUT_MS / 1000}s` : 'Gateway unreachable',
          latencyMs: null,
          lastChecked: Date.now(),
        });
      } finally {
        clearTimeout(t);
        if (alive) timerRef.current = setTimeout(probe, POLL_MS);
      }
    };

    probe();

    return () => {
      alive = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [endpoint]);

  return snap;
}

function formatAgo(ts: number | null): string {
  if (!ts) return '—';
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 1) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function GatewayTicker({
  label = 'Gateway',
  endpoint,
  compact = false,
}: {
  label?: string;
  endpoint?: string;
  compact?: boolean;
}) {
  const snap = useGatewayStatus(endpoint);
  const [_, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const dot =
    snap.status === 'up' ? '#4ade80' : snap.status === 'down' ? '#f87171' : '#fbbf24';
  const word =
    snap.status === 'up' ? 'ONLINE' : snap.status === 'down' ? 'OFFLINE' : 'CHECKING';

  return (
    <div
      title={snap.reason}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: compact ? '3px 8px' : '4px 10px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.04)',
        fontFamily: 'monospace',
        fontSize: 11,
        color: 'rgba(255,255,255,0.75)',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dot,
          boxShadow: snap.status === 'up' ? '0 0 6px rgba(74,222,128,0.65)' : 'none',
          animation: snap.status === 'checking' ? 'pulse 1.4s ease-in-out infinite' : undefined,
        }}
      />
      <span style={{ color: dot, fontWeight: 600, letterSpacing: 0.5 }}>{word}</span>
      <span style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</span>
      {!compact && (
        <>
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>
            {snap.latencyMs != null ? `${snap.latencyMs}ms` : '—'}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.25)' }}>·</span>
          <span style={{ color: 'rgba(255,255,255,0.45)' }}>{formatAgo(snap.lastChecked)}</span>
        </>
      )}
    </div>
  );
}
