'use client';
import { useQuery } from '@tanstack/react-query';

async function checkGateway() {
  const res = await fetch('/api/openclaw/health');
  if (!res.ok) return { ok: false };
  return res.json();
}

export function Header() {
  const { data } = useQuery({ queryKey: ['header-gateway'], queryFn: checkGateway, staleTime: 15000 });

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-white/70 px-6 py-4 backdrop-blur-xl">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">OpenClaw Control Plane</p>
        <p className="text-lg font-semibold text-slate-900">Mothership</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-600">
        <div className={`h-2 w-2 rounded-full ${data?.ok ? 'bg-emerald-400' : 'bg-rose-400'}`} />
        <span>{data?.ok ? 'Systems nominal' : 'Gateway unreachable'}</span>
        <div className="flex items-center gap-1 rounded-full border border-border bg-white px-2 py-1 text-[11px] shadow-sm">
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          <span>Voice: Azure</span>
        </div>
      </div>
    </header>
  );
}
