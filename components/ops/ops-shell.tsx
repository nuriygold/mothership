'use client';

// OpsShell wraps every /ops route in a dark mission-control surface.
// It bleeds to the edges of the parent <main> (which uses px-4 md:px-8 py-5 md:py-8)
// using negative margins, then re-applies its own padding so the whole
// section feels like a self-contained terminal.

import type { CSSProperties, ReactNode } from 'react';
import { opsTheme } from '@/lib/ops/client';

export function OpsShell({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="-mx-4 md:-mx-8 -mt-5 md:-mt-8 -mb-20 md:-mb-12"
      style={{
        background: opsTheme.bg,
        backgroundImage:
          'radial-gradient(ellipse 800px 400px at 20% -10%, rgba(0,255,156,0.06) 0%, transparent 60%), ' +
          'radial-gradient(ellipse 600px 300px at 100% 100%, rgba(108,199,255,0.05) 0%, transparent 60%)',
        color: opsTheme.text,
        minHeight: 'calc(100vh - 46px)',
        fontFamily: opsTheme.body,
        ...style,
      }}
    >
      <div
        style={{
          padding: '14px 16px 96px',
          maxWidth: 1280,
          margin: '0 auto',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Reusable dark card primitive used throughout /ops.
export function OpsCard({
  children,
  className,
  style,
  padded = true,
  glow = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  padded?: boolean;
  glow?: boolean;
}) {
  return (
    <div
      className={className}
      style={{
        background: opsTheme.surface,
        border: `1px solid ${opsTheme.border}`,
        borderRadius: 12,
        padding: padded ? 14 : 0,
        boxShadow: glow
          ? '0 0 0 1px rgba(0,255,156,0.1), 0 8px 32px rgba(0,255,156,0.06)'
          : '0 1px 0 rgba(255,255,255,0.02) inset',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function OpsLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: opsTheme.mono,
        fontSize: 10,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: opsTheme.textDim,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function OpsHeading({
  children,
  level = 2,
  style,
}: {
  children: ReactNode;
  level?: 1 | 2 | 3;
  style?: CSSProperties;
}) {
  const sizes = { 1: 24, 2: 16, 3: 13 } as const;
  const Tag = (`h${level}`) as 'h1' | 'h2' | 'h3';
  return (
    <Tag
      style={{
        fontFamily: opsTheme.display,
        fontWeight: 700,
        fontSize: sizes[level],
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: opsTheme.text,
        margin: 0,
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
