'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export function Header() {
  const [now, setNow] = useState('');
  const router = useRouter();

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

  return (
    <header
      className="flex-shrink-0 flex items-center justify-between px-4 border-b"
      style={{
        height: '46px',
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderColor: '#b8e0f5',
        overflow: 'visible',
        position: 'relative',
        zIndex: 40,
      }}
    >
      <div className="flex items-center gap-3">
        <Link href="/iceman" className="flex items-center gap-2">
          <Image src="/logo.svg" alt="Mothership" width={24} height={24} />
          <span style={{fontWeight:600,fontSize:'13px',color:'var(--ice-text3)'}}>Iceman</span>
        </Link>
      </div>

      <div className="flex items-center gap-3 flex-shrink-0">
        <span
          className="hidden sm:inline text-[11px]"
          style={{ fontFamily: 'var(--font-body)', color: 'var(--ice-text2)', opacity: 0.8 }}
        >
          {now}
        </span>
        <button
          type="button"
          title="Sign out"
          onClick={async () => {
            await fetch('/api/v2/auth/logout', { method: 'POST' });
            router.push('/login' as Parameters<typeof router.push>[0]);
          }}
          className="rounded-lg border p-2 transition-opacity hover:opacity-80"
          style={{
            borderColor: '#b8e0f5',
            color: 'var(--ice-text3)',
            background: 'rgba(255,255,255,0.8)',
          }}
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
