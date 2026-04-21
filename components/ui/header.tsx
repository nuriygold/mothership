'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';

interface ServiceStatus {
  name: string;
  color: string;
  feed: string;    // what data source is being checked
  reason: string;  // why it's this color (human-readable)
  ok: boolean | null;
}

async function checkAllServices() {
  const res = await fetch('/api/v2/health/services');
  if (!res.ok) return null;
  return res.json();
}

function StatusDot({ service }: { service: ServiceStatus }) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHide = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setShow(false), 150);
  };

  const statusLabel = service.ok === null ? 'Checking…' : service.ok ? 'Online' : 'Issue detected';

  // Close on outside click (for touch devices where hover doesn't exist)
  useEffect(() => {
    if (!show) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [show]);

  return (
    <div
      ref={ref}
      className="relative flex items-center gap-1.5 flex-shrink-0 cursor-default"
      onMouseEnter={() => { cancelHide(); setShow(true); }}
      onMouseLeave={scheduleHide}
      onClick={() => setShow((s) => !s)}
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

      {/* Tooltip — fixed so it never clips behind header */}
      {show && (
        <div
          className="fixed z-[9999] rounded-xl px-3 py-2.5 text-xs w-64"
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          style={{
            top: '48px',
            left: ref.current ? Math.min(ref.current.getBoundingClientRect().left, window.innerWidth - 270) : 0,
            background: '#0A1628',
            border: '1px solid rgba(0,217,255,0.2)',
            color: '#E8EDF5',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          {/* Service name + status */}
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: service.color }} />
            <span className="font-semibold" style={{ color: service.color }}>{service.name}</span>
            <span className="ml-auto opacity-60 text-[10px]">{statusLabel}</span>
          </div>

          {/* What feed is checked */}
          <div className="mb-1.5">
            <span className="opacity-40 text-[10px] uppercase tracking-wide">Checking</span>
            <p className="mt-0.5 opacity-75 leading-snug">{service.feed}</p>
          </div>

          {/* Reason */}
          {service.reason && (
            <div
              className="mt-2 rounded-lg px-2 py-1.5 text-[11px] leading-snug"
              style={{
                background: service.ok ? 'rgba(0,217,255,0.08)' : 'rgba(255,92,92,0.12)',
                color: service.ok ? '#00D9FF' : '#FF8080',
              }}
            >
              {service.reason}
            </div>
          )}

          {/* Fix button for unhealthy services */}
          {!service.ok && service.ok !== null && (
            <a
              href="https://vercel.com/nuriys-projects/mothership/settings/environment-variables"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center justify-center rounded-lg px-2 py-1.5 text-[11px] font-semibold hover:opacity-80 transition-opacity"
              style={{ background: 'rgba(255,92,92,0.2)', color: '#FF8080', display: 'flex' }}
              onClick={(e) => e.stopPropagation()}
            >
              Fix in Vercel →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

const SERVICE_DEFINITIONS: Array<{ key: string; name: string; feed: string }> = [
  { key: 'gateway',  name: 'Gateway',  feed: 'OpenClaw gateway /health endpoint — core routing layer' },
  { key: 'ruby',     name: 'Drizzy',   feed: 'Task DB query — counts active tasks assigned to Drizzy bot' },
  { key: 'telegram', name: 'Telegram', feed: 'Telegram Bot API — validates bot token via getMe call' },
  { key: 'github',   name: 'GitHub',   feed: 'GitHub API — checks task-pool repo access & auth token' },
  { key: 'zoho',     name: 'Zoho',     feed: 'Zoho Mail — verifies IMAP credentials are configured' },
  { key: 'gmail',    name: 'Gmail',    feed: 'Gmail OAuth2 — attempts token refresh to verify access' },
];

const FALLBACK_SERVICES: ServiceStatus[] = SERVICE_DEFINITIONS.map((d) => ({
  name: d.name,
  feed: d.feed,
  color: '#FFB800',
  reason: 'Connecting…',
  ok: null,
}));

function buildServices(data: Record<string, { ok: boolean; reason?: string }> | null): ServiceStatus[] {
  return SERVICE_DEFINITIONS.map(({ key, name, feed }) => {
    if (!data) return { name, feed, color: '#FFB800', reason: 'Connecting…', ok: null };

    const svc = data[key];
    const ok = svc?.ok ?? false;
    const rawReason = svc?.reason ?? '';

    // Yellow = misconfigured (env vars missing), Red = configured but unreachable
    const isMisconfig = !ok && (rawReason.toLowerCase().includes('not configured') || rawReason.toLowerCase().includes('not set'));
    const color = ok ? '#00D9FF' : isMisconfig ? '#FFB800' : '#FF5C5C';
    const reason = ok ? rawReason || 'All checks passed' : rawReason || 'Status unknown';

    return { name, feed, color, reason, ok };
  });
}

export function Header() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [now, setNow] = useState('');
  const router = useRouter();

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

      {/* Right: date/time + theme toggle + sign out */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="hidden sm:inline text-[11px]" style={{ color: 'var(--sidebar-foreground)', opacity: 0.65 }}>
          {now}
        </span>
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-full border px-3 py-2 text-xs min-h-[44px] transition-opacity hover:opacity-80"
          style={{
            borderColor: 'var(--sidebar-border)',
            color: 'var(--sidebar-foreground)',
            opacity: 0.7,
          }}
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
        <button
          type="button"
          title="Sign out"
          onClick={async () => {
            await fetch('/api/v2/auth/logout', { method: 'POST' });
            router.push('/login' as Parameters<typeof router.push>[0]);
          }}
          className="rounded-full border p-2 transition-opacity hover:opacity-80"
          style={{
            borderColor: 'var(--sidebar-border)',
            color: 'var(--sidebar-foreground)',
            opacity: 0.55,
          }}
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
