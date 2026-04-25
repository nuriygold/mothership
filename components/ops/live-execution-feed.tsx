'use client';

import useSWR from 'swr';
import { useEffect, useRef } from 'react';
import { Radio } from 'lucide-react';
import { levelColor, opsFetcher, opsTheme } from '@/lib/ops/client';
import type { FeedEvent } from '@/lib/ops/types';
import { OpsCard, OpsHeading, OpsLabel } from './ops-shell';

function formatHHMMSS(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function LiveExecutionFeed({ campaignId, initialEvents }: { campaignId: string; initialEvents: FeedEvent[] }) {
  const { data } = useSWR<{ events: FeedEvent[] }>(
    `/api/ops/campaigns/${campaignId}/feed`,
    opsFetcher,
    { refreshInterval: 2500, fallbackData: { events: initialEvents } }
  );
  const events = data?.events ?? initialEvents;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track latest event id so we know when something new arrived (without forcing scroll).
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [events[0]?.id]);

  return (
    <OpsCard padded={false}>
      <div
        style={{
          padding: '10px 14px',
          borderBottom: `1px solid ${opsTheme.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.015)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Radio size={14} style={{ color: opsTheme.green }} />
          <OpsHeading level={3}>Live Execution Feed</OpsHeading>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: opsTheme.green,
              boxShadow: `0 0 8px ${opsTheme.green}`,
              animation: 'opsPulse 1.4s ease-in-out infinite',
            }}
          />
          <OpsLabel>Streaming</OpsLabel>
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          padding: 12,
          maxHeight: 320,
          overflowY: 'auto',
          fontFamily: opsTheme.mono,
          fontSize: 11.5,
          lineHeight: 1.7,
          background: opsTheme.bg,
          borderRadius: '0 0 12px 12px',
        }}
      >
        {events.length === 0 && (
          <div style={{ color: opsTheme.textDim, padding: 8 }}>Awaiting events…</div>
        )}
        {events.map((e, i) => (
          <div
            key={e.id}
            style={{
              display: 'flex',
              gap: 12,
              padding: '2px 0',
              opacity: i === 0 ? 1 : Math.max(0.55, 1 - i * 0.012),
              animation: i === 0 ? 'opsFadeIn 280ms ease-out' : undefined,
            }}
          >
            <span style={{ color: opsTheme.textDim, flexShrink: 0, letterSpacing: '0.04em' }}>
              {formatHHMMSS(e.timestamp)}
            </span>
            <span
              style={{
                color: levelColor(e.level),
                flexShrink: 0,
                width: 50,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontSize: 10,
                paddingTop: 2,
              }}
            >
              {e.level}
            </span>
            <span style={{ color: opsTheme.text, wordBreak: 'break-word' }}>{e.message}</span>
          </div>
        ))}
      </div>
    </OpsCard>
  );
}
