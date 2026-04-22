'use client';

import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { MarketData } from '@/app/api/v2/finance/markets/route';

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

async function fetchMarkets(): Promise<MarketData | null> {
  const res = await fetch('/api/v2/finance/markets');
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
  { key: 'ruby',     label: 'OPENCLAW' },
  { key: 'supabase', label: 'SUPABASE' },
];

function dotColor(ok: boolean | null): string {
  if (ok === null) return '#FFB800';
  return ok ? '#40c8f0' : '#FF5C5C';
}

function fmtPrice(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtChange(pct: number): string {
  const sign = pct >= 0 ? '▲' : '▼';
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

function changeColor(pct: number): string {
  return pct >= 0 ? '#3DBE8C' : '#FF6B6B';
}

export function StatusTicker() {
  const { data: services } = useQuery({
    queryKey: ['ticker-services'],
    queryFn: fetchServices,
    staleTime: 30000,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });

  const { data: markets } = useQuery({
    queryKey: ['ticker-markets'],
    queryFn: fetchMarkets,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: true,
  });

  const [paused, setPaused] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  const serviceItems = SERVICE_KEYS.map(({ key, label }) => ({
    label,
    value: services ? (services[key]?.ok ?? null) === null ? 'CHECKING' : services[key]?.ok ? 'ONLINE' : 'ISSUE' : 'CHECKING',
    dot: dotColor(services ? (services[key]?.ok ?? null) : null),
    changeColor: null as string | null,
  }));

  const marketItems: { label: string; value: string; dot: string; changeColor: string | null }[] = [
    {
      label: 'BTC',
      value: markets?.btc
        ? `$${fmtPrice(markets.btc.price)} ${fmtChange(markets.btc.change)}`
        : '—',
      dot: '#F7931A',
      changeColor: markets?.btc ? changeColor(markets.btc.change) : null,
    },
    {
      label: 'DOW',
      value: markets?.dow
        ? `${fmtPrice(markets.dow.price)} ${fmtChange(markets.dow.change)}`
        : '—',
      dot: '#085070',
      changeColor: markets?.dow ? changeColor(markets.dow.change) : null,
    },
    {
      label: 'NYSE',
      value: markets?.nyse
        ? `${fmtPrice(markets.nyse.price)} ${fmtChange(markets.nyse.change)}`
        : '—',
      dot: '#085070',
      changeColor: markets?.nyse ? changeColor(markets.nyse.change) : null,
    },
    { label: 'VERCEL', value: '▲', dot: '#085070', changeColor: null },
  ];

  const allItems = [...serviceItems, ...marketItems];
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
            <span style={{ color: item.changeColor ?? item.dot }}>{item.value}</span>
            <span style={{ color: 'var(--ice-border)', paddingLeft: '16px' }}>|</span>
          </span>
        ))}
      </div>
    </div>
  );
}
