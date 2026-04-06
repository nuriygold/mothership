'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

interface ServiceStatus {
  name: string;
  color: string;
  tooltip: string;
}

async function checkAllServices() {
  const res = await fetch('/api/v2/health/services');
  if (!res.ok) return null;
  return res.json();
}

function StatusDot({ service }: { service: ServiceStatus }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="relative flex items-center gap-1.5 flex-shrink-0 cursor-default"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <div
        className="w-2 h-2 rounded-full transition-all"
        style={{
          background: service.color,
          boxShadow: `0 0 6px ${service.color}80`,
        }}
      />
      <span className="text-[11px]" style={{ color: 'var(--sidebar-foreground)', opacity: 0.65 }}>
        {service.name}
      </span>

      {/* Tooltip */}
      {show && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 rounded-xl px-3 py-2 text-xs w-52 pointer-events-none"
          style={{
            background: '#0A1628',
            border: '1px solid rgba(0,217,255,0.2)',
            color: '#E8EDF5',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: service.color }}
            />
            <span className="font-semibold text-[11px]" style={{ color: service.color }}>
              {service.name}
            </span>
          </div>
          <p style={{ color: 'rgba(232,237,245,0.75)', lineHeight: '1.4' }}>{service.tooltip}</p>
          {/* Arrow */}
          <div
            className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45"
            style={{ background: '#0A1628', borderLeft: '1px solid rgba(0,217,255,0.2)', borderTop: '1px solid rgba(0,217,255,0.2)' }}
          />
        </div>
      )}
    </div>
  );
}

const FALLBACK_SERVICES: ServiceStatus[] = [
  { name: 'Gateway', color: '#FFB800', tooltip: 'Checking OpenClaw gateway reachability...' },
  { name: 'Ruby', color: '#FFB800', tooltip: 'Checking Ruby bot DB task queue...' },
  { name: 'Telegram', color: '#FFB800', tooltip: 'Checking Telegram bot token validity...' },
  { name: 'GitHub', color: '#FFB800', tooltip: 'Checking GitHub task-pool connectivity...' },
  { name: 'Zoho', color: '#FFB800', tooltip: 'Checking Zoho IMAP mail connection...' },
  { name: 'Gmail', color: '#FFB800', tooltip: 'Checking Gmail OAuth token validity...' },
];

function buildServices(data: Record<string, { ok: boolean; reason?: string }> | null): ServiceStatus[] {
  const definitions: Array<{ key: string; name: string; feedDesc: string }> = [
    { key: 'gateway',  name: 'Gateway',  feedDesc: 'OpenClaw /health endpoint' },
    { key: 'ruby',     name: 'Ruby',     feedDesc: 'Bot task queue (DB: active tasks assigned to Ruby)' },
    { key: 'telegram', name: 'Telegram', feedDesc: 'Telegram Bot API token validation' },
    { key: 'github',   name: 'GitHub',   feedDesc: 'GitHub API — task-pool repository access' },
    { key: 'zoho',     name: 'Zoho',     feedDesc: 'Zoho Mail IMAP connection check' },
    { key: 'gmail',    name: 'Gmail',    feedDesc: 'Gmail OAuth2 token refresh check' },
  ];

  return definitions.map(({ key, name, feedDesc }) => {
    if (!data) {
      return { name, color: '#FFB800', tooltip: `Checking… (${feedDesc})` };
    }
    const svc = data[key];
    const ok = svc?.ok;
    const reason = svc?.reason ?? '';
    const color = ok ? '#00D9FF' : reason.includes('config') ? '#FFB800' : '#FF5C5C';

    let tooltip = feedDesc;
    if (!ok && reason) {
      tooltip += `\n\n⚠ ${reason}`;
    } else if (ok) {
      tooltip = `✓ Online — ${feedDesc}`;
    }

    return { name, color, tooltip };
  });
}

export function Header() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [now, setNow] = useState('');

  useEffect(() => {
    const saved = (localStorage.getItem('mothership-theme') as 'light' | 'dark') || 'light';
    setTheme(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }, []);

  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      setNow(
        d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
          ' · ' +
          d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      );
    };
    fmt();
    const t = setInterval(fmt, 30000);
    return () => clearInterval(t);
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('mothership-theme', next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const { data } = useQuery({
    queryKey: ['header-services'],
    queryFn: checkAllServices,
    staleTime: 30000,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });

  const services = buildServices(data);

  return (
    <header
      className="flex-shrink-0 h-11 flex items-center justify-between px-4 border-b"
      style={{
        background: 'var(--sidebar)',
        borderColor: 'var(--sidebar-border)',
        overflow: 'visible',
        position: 'relative',
        zIndex: 40,
      }}
    >
      {/* Left: service status dots with tooltips */}
      <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide">
        {services.map((s) => (
          <StatusDot key={s.name} service={s} />
        ))}
      </div>

      {/* Right: date/time + theme toggle */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-[11px]" style={{ color: 'var(--sidebar-foreground)', opacity: 0.65 }}>
          {now}
        </span>
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-full border px-2 py-0.5 text-[10px] transition-opacity hover:opacity-80"
          style={{
            borderColor: 'var(--sidebar-border)',
            color: 'var(--sidebar-foreground)',
            opacity: 0.7,
          }}
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
      </div>
    </header>
  );
}
