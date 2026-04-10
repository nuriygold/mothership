'use client';

import { useEffect, useState } from 'react';

export function NowLine() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(i);
  }, []);
  const label = time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="relative flex items-center my-2" style={{ zIndex: 10 }}>
      <span className="absolute -top-4 left-0 text-[10px] font-semibold" style={{ color: 'var(--color-cyan)' }}>
        {label}
      </span>
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: 'var(--color-cyan)', boxShadow: '0 0 6px rgba(0,217,255,0.6)' }} />
      <div className="flex-1 h-px" style={{ background: 'var(--color-cyan)', opacity: 0.7 }} />
    </div>
  );
}
