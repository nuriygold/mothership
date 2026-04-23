'use client';

import useSWR from 'swr';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { botColor, streamByKey } from '@/lib/v2/revenue-streams';

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

type StreamStatus = {
  key: string;
  displayName: string;
  leadBotKey: 'adrian' | 'ruby' | 'emerald' | 'adobe' | 'anchor';
  leadDisplay: string;
  status: string;
  note: string | null;
  requestedAt: string | null;
  lastReportAt: string | null;
  lastReport: string | null;
  updatedAt: string | null;
};

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

export default function StreamDrilldown() {
  const { stream: streamKey } = useParams<{ stream: string }>();
  const def = streamByKey(streamKey);

  const { data: statusData, mutate } = useSWR<{ streams: StreamStatus[] }>(
    '/api/v2/revenue-streams/status',
    fetcher,
    { refreshInterval: 60_000 }
  );

  const { data: activityData, mutate: mutateActivity } = useSWR<{ stream: string; activity: ActivityEntry[] }>(
    streamKey ? `/api/v2/revenue-streams/activity?stream=${streamKey}` : null,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const [sop, setSop] = useState<SopData | null>(null);
  const [sopLoading, setSopLoading] = useState(false);
  const [inflight, setInflight] = useState(false);

  useEffect(() => {
    if (!streamKey) return;
    setSopLoading(true);
    fetch(`/api/v2/revenue-streams/sop?stream=${streamKey}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSop(d))
      .finally(() => setSopLoading(false));
  }, [streamKey]);

  useEffect(() => {
    const es = new EventSource('/api/v2/stream/revenue-streams');
    const handler = () => { mutate(); mutateActivity(); };
    es.addEventListener('status', handler);
    es.addEventListener('action', handler);
    return () => es.close();
  }, [mutate, mutateActivity]);

  const stream = statusData?.streams.find((s) => s.key === streamKey);

  const doAction = useCallback(async (action: 'run-report' | 'check-status' | 'ping') => {
    if (!streamKey) return;
    setInflight(true);
    try {
      await fetch('/api/v2/revenue-streams/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream: streamKey, action }),
      });
      mutate();
      mutateActivity();
    } finally {
      setInflight(false);
    }
  }, [streamKey, mutate, mutateActivity]);

  if (!def) {
    return (
      <div className="card">
        <div className="card-title">Stream not found</div>
        <Link href={"/revenue-streams" as any} style={{ fontSize: 13, color: 'var(--green)' }}>
          ← Back to streams
        </Link>
      </div>
    );
  }

  const leadColor = botColor(def.leadBotKey);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="section-head">
        <span>
          <Link href={"/revenue-streams" as any} style={{ color: 'var(--text3)', textDecoration: 'none', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            Streams
          </Link>
          {' / '}
          <strong>{def.displayName}</strong>
        </span>
        <span className="sse-indicator"><span className="sse-pulse" /> live</span>
      </div>

      {/* Status card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div className="card-title" style={{ marginBottom: 4 }}>{def.displayName}</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
              lead: <span style={{ color: leadColor }}>{def.leadDisplay}</span>
            </div>
          </div>
          {stream && (
            <span
              className="badge"
              style={{
                background:
                  stream.status === 'active' ? 'var(--green3)' : stream.status === 'paused' ? 'var(--amber2)' : 'var(--bg3)',
                color:
                  stream.status === 'active' ? 'var(--green)' : stream.status === 'paused' ? 'var(--amber)' : 'var(--text3)',
              }}
            >
              {stream.status}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
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

        {stream?.note && (
          <div style={{ marginTop: 12, padding: 10, background: 'var(--bg2)', borderRadius: 'var(--radius)', fontSize: 12, color: 'var(--text2)', fontStyle: 'italic', lineHeight: 1.5 }}>
            {stream.note}
          </div>
        )}

        {stream?.requestedAt && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
            Pinged {new Date(stream.requestedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>

      {/* SOP */}
      <div className="card">
        <div className="card-title">Standard Operating Procedure</div>
        {sopLoading && <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>Loading SOP…</div>}
        {!sopLoading && !sop && <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic' }}>SOP not available.</div>}
        {sop && (
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }} className="sop-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{sop.markdown}</ReactMarkdown>
            <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
              last modified {new Date(sop.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
            </div>
          </div>
        )}
      </div>

      {/* Activity log */}
      <div className="card">
        <div className="card-title">Activity log</div>
        {!activityData || activityData.activity.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text3)', fontStyle: 'italic', padding: '8px 0' }}>No activity yet.</div>
        ) : (
          activityData.activity.map((entry) => (
            <div key={entry.id} className="finance-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="finance-name" style={{ fontSize: 12 }}>{actionLabel(entry.action)}</div>
                {entry.note && (
                  <div className="finance-meta" style={{ whiteSpace: 'normal', lineHeight: 1.4 }}>{entry.note}</div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)', flexShrink: 0, textAlign: 'right' }}>
                {new Date(entry.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
