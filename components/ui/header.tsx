'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

interface ServiceStatus {
  name: string;
  color: string; // hex
}

async function checkGateway() {
  const res = await fetch('/api/openclaw/health');
  if (!res.ok) return { ok: false };
  return res.json();
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

  const { data, isLoading } = useQuery({
    queryKey: ['header-gateway'],
    queryFn: checkGateway,
    staleTime: 15000,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  const gatewayColor = isLoading ? '#FFB800' : data?.ok ? '#00D9FF' : '#FF5C5C';

  const services: ServiceStatus[] = [
    { name: 'Gateway', color: gatewayColor },
    { name: 'Ruby', color: '#00D9FF' },
    { name: 'Telegram', color: '#00D9FF' },
    { name: 'GitHub', color: '#00D9FF' },
    { name: 'Zoho', color: '#FFB800' },
    { name: 'Gmail', color: '#00D9FF' },
  ];

  return (
    <header
      className="flex-shrink-0 h-11 flex items-center justify-between px-4 border-b"
      style={{
        background: 'var(--sidebar)',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      {/* Left: status dots */}
      <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide">
        {services.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5 flex-shrink-0">
            <div
              className="w-2 h-2 rounded-full"
              style={{ background: s.color, boxShadow: `0 0 6px ${s.color}80` }}
            />
            <span className="text-[11px]" style={{ color: 'var(--sidebar-foreground)', opacity: 0.65 }}>
              {s.name}
            </span>
          </div>
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
