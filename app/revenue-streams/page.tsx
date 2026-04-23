'use client';

import useSWR from 'swr';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { botColor } from '@/lib/v2/revenue-streams';
import type { RevenueStreamDef } from '@/lib/v2/revenue-streams';

type StreamStatus = {
  key: string;
  displayName: string;
  leadBotKey: RevenueStreamDef['leadBotKey'];
  leadDisplay: string;
  status: string;
  note: string | null;
  requestedAt: string | null;
  lastReportAt: string | null;
  lastReport: string | null;
  updatedAt: string | null;
};

type ActivityEntry = {
  id: string;
  stream: string;
  status: string;
  note: string | null;
  action: string | null;
  createdAt: string;
};

type SopData = {
  key: string;
  title: string;
  markdown: string;
  updatedAt: string;
};

const STATUS_URL = '/api/v2/revenue-streams/status';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function actionLabel(action: string | null) {
  switch (action) {
    case 'ping': return 'Pinged lead';
    case 'run-report': return 'Report run';
    case 'check-status': return 'Status check';
    case 'agent-update': return 'Agent update';
    default: return action ?? 'event';
  }
}

function StreamCard({ stream, onMutate }: { stream: StreamStatus; onMutate: () => void }) {
  const [sopOpen, setSopOpen] = useState(false);
  const [sopData, setSopData] = useState<SopData | null>(null);
  const [sopLoading, setSopLoading] = useState(false);
  const [inflight, setInflight] = useState(false);

  const { data: activityData } = useSWR<{ stream: string; activity: ActivityEntry[] }>(
    `/api/v2/revenue-streams/activity?stream=${stream.key}`,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const leadColor = botColor(stream.leadBotKey);

  const doAction = useCallback(async (action: 'run-report' | 'check-status' | 'ping') => {
    setInflight(true);
    try {
      await fetch('/api/v2/revenue-streams/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream: stream.key, action }),
      });
      onMutate();
    } finally {
      setInflight(false);
    }
  }, [stream.key, onMutate]);

  const handleSopToggle = useCallback(async () => {
    if (!sopOpen && !sopData) {
      setSopLoading(true);
      try {
        const res = await fetch(`/api/v2/revenue-streams/sop?stream=${stream.key}`);
        if (res.ok) setSopData(await res.json());
      } finally {
        setSopLoading(false);
      }
    }
    setSopOpen((v) => !v);
  }, [sopOpen, sopData, stream.key]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border-c)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <Link href={`/revenue-streams/${stream.key}` as any} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--text)',
                  fontFamily: 'var(--font-rajdhani)',
                  letterSpacing: 0.5,
                  cursor: 'pointer',
                }}
              >
                {stream.displayName}
              </div>
            </Link>
            <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              lead: <span style={{ color: leadColor }}>{stream.leadDisplay}</span>
              {stream.updatedAt
                ? ` · updated ${new Date(stream.updatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
                : null}
            </div>
          </div>
          <span
            className="badge"
            style={{
              background:
                stream.status === 'active'
                  ? 'var(--green3)'
                  : stream.status === 'paused'
                  ? 'var(--amber2)'
                  : 'var(--bg3)',
              color:
                stream.status === 'active'
                  ? 'var(--green)'
                  : stream.status === 'paused'
                  ? 'var(--amber)'
                  : 'var(--text3)',
              fontSize: 11,
            }}
          >
            {stream.status}
          </span>
        </div>

        {/* Action row */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button className="btn-sm" disabled={inflight} onClick={() => doAction('run-report')}>
            Run Report
          </button>
          <button className="btn-sm" disabled={inflight} onClick={() => doAction('check-status')}>
            Check Status
          </button>
          <button className="btn-sm" disabled={inflight} onClick={() => doAction('ping')}>
            Ping Lead
          </button>
        </div>
      </div>

      {/* Status note */}
      {stream.note && (
        <div
          style={{
            padding: '10px 16px',
            fontSize: 12,
            color: 'var(--text2)',
            fontStyle: 'italic',
            borderBottom: '1px solid var(--border-c)',
          }}
        >
          {stream.note}
        </div>
      )}

      {/* Expandable SOP */}
      <div style={{ borderBottom: '1px solid var(--border-c)' }}>
        <button
          onClick={handleSopToggle}
          style={{
            width: '100%',
            padding: '9px 16px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--text2)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            textAlign: 'left',
          }}
        >
          <span style={{ transition: 'transform 0.15s', transform: sopOpen ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>▶</span>
          SOP {sopLoading ? '(loading…)' : sopOpen ? '(collapse)' : '(expand)'}
        </button>
        {sopOpen && sopData && (
          <div
            style={{
              padding: '0 16px 14px',
              fontSize: 12,
              color: 'var(--text2)',
              lineHeight: 1.6,
            }}
            className="sop-content"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{sopData.markdown}</ReactMarkdown>
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div style={{ padding: '10px 16px' }}>
        <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
          Recent activity
        </div>
        {!activityData || activityData.activity.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>No activity yet.</div>
        ) : (
          activityData.activity.slice(0, 5).map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                gap: 8,
                padding: '5px 0',
                borderBottom: '1px solid var(--border-c)',
                fontSize: 11,
              }}
            >
              <div style={{ color: 'var(--text3)', fontFamily: 'var(--font-mono)', flexShrink: 0, minWidth: 80 }}>
                {new Date(entry.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
              <div style={{ color: 'var(--green)', flexShrink: 0 }}>{actionLabel(entry.action)}</div>
              {entry.note && (
                <div style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {entry.note}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function RevenueStreamsPage() {
  const { data, mutate } = useSWR<{ streams: StreamStatus[] }>(STATUS_URL, fetcher, {
    refreshInterval: 60_000,
  });

  useEffect(() => {
    const es = new EventSource('/api/v2/stream/revenue-streams');
    const handler = () => { mutate(); };
    es.addEventListener('status', handler);
    es.addEventListener('action', handler);
    return () => es.close();
  }, [mutate]);

  const streams = data?.streams ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="section-head">
        <span>Revenue Streams — workspace</span>
        <span className="sse-indicator"><span className="sse-pulse" /> live</span>
      </div>

      {streams.length === 0 && (
        <div className="card">
          <div className="card-title">Loading streams…</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {streams.map((s) => (
          <StreamCard key={s.key} stream={s} onMutate={mutate} />
        ))}
      </div>
    </div>
  );
}
