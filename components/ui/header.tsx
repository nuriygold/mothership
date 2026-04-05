'use client';
import { useQuery } from '@tanstack/react-query';

async function checkGateway() {
  const res = await fetch('/api/openclaw/health');
  if (!res.ok) return { ok: false, message: `Gateway check failed (${res.status})` };
  return res.json();
}

export function Header() {
  const { data, isLoading } = useQuery({
    queryKey: ['header-gateway'],
    queryFn: checkGateway,
    staleTime: 15000,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  const statusState = isLoading ? 'checking' : data?.ok ? 'healthy' : 'unhealthy';
  const statusText =
    statusState === 'checking'
      ? 'Checking gateway...'
      : data?.ok
        ? 'Systems nominal'
        : data?.message || 'Gateway unreachable';

  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between border-b border-border px-6 py-4 backdrop-blur-xl"
      style={{ background: 'var(--sidebar)', color: 'var(--foreground)' }}
    >
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted-foreground)]">OpenClaw Control Plane</p>
        <p className="text-lg font-semibold text-[color:var(--foreground)]">Mothership</p>
      </div>
      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted-foreground)' }}>
        <div
          className={`h-2 w-2 rounded-full ${
            statusState === 'healthy' ? 'bg-emerald-400' : statusState === 'checking' ? 'bg-amber-300' : 'bg-rose-400'
          }`}
        />
        <span>{statusText}</span>
        <div className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] shadow-sm" style={{ background: 'var(--card)' }}>
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          <span style={{ color: 'var(--foreground)' }}>Voice: Azure</span>
        </div>
      </div>
    </header>
  );
}
