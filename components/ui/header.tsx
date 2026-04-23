'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, Snowflake, Network, Brain, Globe, Trophy } from 'lucide-react';
import Link from 'next/link';

/** Inline ice-cube logo — isometric cube with a frosty highlight. */
function IceCubeLogo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12 2.2 L21.2 7.2 L21.2 16.8 L12 21.8 L2.8 16.8 L2.8 7.2 Z"
        fill="rgba(184,228,248,0.55)"
        stroke="#40c8f0"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M2.8 7.2 L12 12.2 L21.2 7.2" stroke="#40c8f0" strokeWidth="0.9" opacity="0.75" />
      <path d="M12 12.2 L12 21.8" stroke="#40c8f0" strokeWidth="0.9" opacity="0.75" />
      <path d="M5.5 5 L8 4 L8.2 6.2 L5.6 7.2 Z" fill="#ffffff" opacity="0.75" />
    </svg>
  );
}

const HEADER_NAV: Array<{ href: string; label: string; icon: React.ElementType; gold?: boolean }> = [
  { href: '/iceman', label: 'Iceman', icon: Snowflake },
  { href: '/marvin', label: "Marvin's Room", icon: Network },
  { href: '/claude', label: 'Claude', icon: Brain },
  { href: '/marco', label: 'Marco', icon: Globe },
  { href: '/trophy', label: 'Trophies', icon: Trophy, gold: true },
];

export function Header() {
  const [now, setNow] = useState('');
  const router = useRouter();
  const pathname = usePathname() ?? '';

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
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Left: ice cube + "iceman edition" */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <Link href={"/iceman" as any} className="flex items-center gap-2">
          <IceCubeLogo size={22} />
          <span
            style={{
              fontWeight: 600,
              fontSize: '11px',
              color: 'var(--ice-text3)',
              textTransform: 'lowercase',
              fontVariant: 'small-caps',
              letterSpacing: '0.08em',
            }}
          >
            iceman edition
          </span>
        </Link>
      </div>

      {/* Center: persona nav — Iceman / Marvin / Claude / Marco / Trophy(gold) */}
      <nav className="hidden sm:flex items-center gap-1 flex-1 justify-center">
        {HEADER_NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          const color = item.gold ? '#b8902a' : active ? '#0470a0' : 'var(--ice-text3)';
          return (
            <Link
              key={item.href}
              href={item.href as any}
              title={item.label}
              aria-label={item.label}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-opacity hover:opacity-80"
              style={{
                background: active ? 'rgba(64,200,240,0.12)' : 'transparent',
                color,
              }}
            >
              <Icon className="w-4 h-4" style={{ color }} />
              <span
                className="hidden md:inline text-[10px] font-semibold uppercase tracking-wide"
                style={{ color }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Right: time + logout */}
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
