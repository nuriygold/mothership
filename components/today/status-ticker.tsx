'use client';

import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';

interface ServiceStatus {
  name: string;
  color: string;
  ok: boolean | null;
}

async function fetchServices(): Promise<Record<string, { ok: boolean; reason?: string }> | null> {
  const res = await fetch('/api/v2/health/services');
  if (!res.ok) return null;
  return res.json();
}

const SERVICE_KEYS = [
  { key: 'gateway',  label: 'OVO GATEWAY' },
  { key: 'ruby',     label: 'DRIZZY' },
  { key: 'telegram', label: 'TELEGRAM' },
  { key: 'github',   label: 'GITHUB' },
  { key: 'zoho',     label: 'ZOHO' },
  { key: 'gmail',    label: 'GMAIL' },
];

const MARKET_ITEMS = [
  { label: 'VERCEL', value: '▲' },
  { label: 'BTC',    value: '—' },
  { label: 'NYSE',   value: '—' },
  { label: 'DOW',    value: '—' },
];

function dotColor(ok: boolean | null): string {
  if (ok === null) return '#FFB800';
  return ok ? '#40c8f0' : '#FF5C5C';
}

export function StatusTicker() {
  const { data } = useQuery({
    queryKey: ['ticker-services'],
    queryFn: fetchServices,
    staleTime: 30000,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });

  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const serviceItems: { label: string; ok: boolean | null }[] = SERVICE_KEYS.map(({ key, label }) => ({
    label,
    ok: data ? (data[key]?.ok ?? null) : null,
  }));

  // Build all ticker items — services first, then market
  const allItems = [
    ...serviceItems.map((s) => ({
      label: s.label,
      value: s.ok === null ? 'CHECKING' : s.ok ? 'ONLINE' : 'ISSUE',
      dot: dotColor(s.ok),
    })),
    ...MARKET_ITEMS.map((m) => ({ label: m.label, value: m.value, dot: '#085070' })),
  ];

  // Duplicate for seamless loop
  const doubled = [...allItems, ...allItems];

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.65)',
        borderBottom: '1px solid #b8e0f5',
        overflow: 'hidden',
        position: 'relative',
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        // Faded edges
        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
        maskImage: 'linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)',
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        style={{
          display: 'flex',
          gap: '0',
          whiteSpace: 'nowrap',
          animation: `ticker-scroll 28s linear infinite`,
          animationPlayState: paused ? 'paused' : 'running',
          willChange: 'transform',
        }}
      >
        {doubled.map((item, idx) => (
          <span
            key={idx}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10px',
              color: 'var(--ice-text2)',
              padding: '0 20px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              letterSpacing: '0.04em',
            }}
          >
            <span style={{ color: item.dot, fontSize: '8px' }}>●</span>
            <span style={{ fontWeight: 500, color: 'var(--ice-text)', letterSpacing: '0.08em' }}>{item.label}</span>
            <span style={{ color: item.dot }}>{item.value}</span>
            <span style={{ color: 'var(--ice-border)', paddingLeft: '16px' }}>|</span>
          </span>
        ))}
      </div>
    </div>
  );
}
