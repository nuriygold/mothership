'use client';

import { useState } from 'react';
import { opsTheme } from '@/lib/ops/client';
import type { OpsTickerSummary } from '@/lib/ops/types';

export function SystemStatusTicker({ summary }: { summary: OpsTickerSummary | null }) {
  const [paused, setPaused] = useState(false);

  const entries = summary?.entries ?? [
    { label: 'Loading…', status: 'OK' as const },
  ];
  const summaryEntry = summary
    ? {
        label: `${summary.activeCampaigns} Active Campaigns | ${summary.blockedCampaigns} Blocked`,
        status: summary.blockedCampaigns > 0 ? ('CRIT' as const) : ('OK' as const),
      }
    : null;
  const allItems = summaryEntry ? [...entries, summaryEntry] : entries;
  const doubled = [...allItems, ...allItems];

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        background: opsTheme.surfaceRaised,
        border: `1px solid ${opsTheme.border}`,
        borderRadius: 8,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%)',
        maskImage: 'linear-gradient(to right, transparent 0%, black 4%, black 96%, transparent 100%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          whiteSpace: 'nowrap',
          animation: 'ticker-scroll 36s linear infinite',
          animationPlayState: paused ? 'paused' : 'running',
          willChange: 'transform',
        }}
      >
        {doubled.map((item, i) => {
          const dot =
            item.status === 'CRIT'
              ? opsTheme.red
              : item.status === 'WARN'
              ? opsTheme.amber
              : opsTheme.green;
          return (
            <span
              key={i}
              style={{
                fontFamily: opsTheme.mono,
                fontSize: 11,
                color: opsTheme.textMuted,
                padding: '0 18px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                letterSpacing: '0.06em',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: dot,
                  boxShadow: `0 0 8px ${dot}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: opsTheme.text }}>{item.label}</span>
              <span style={{ color: opsTheme.textDim, paddingLeft: 16 }}>·</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
