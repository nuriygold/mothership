'use client';

import { Rocket } from 'lucide-react';
import { opsTheme } from '@/lib/ops/client';

export function DispatchFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dispatch new campaign"
      style={{
        position: 'fixed',
        right: 20,
        bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
        zIndex: 60,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '14px 20px',
        borderRadius: 999,
        border: `1px solid ${opsTheme.green}`,
        background: opsTheme.green,
        color: '#04140a',
        fontFamily: opsTheme.mono,
        fontWeight: 700,
        fontSize: 12,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        boxShadow: `0 0 32px ${opsTheme.green}66, 0 8px 24px rgba(0,0,0,0.5)`,
        animation: 'opsFabFloat 3s ease-in-out infinite',
      }}
    >
      <Rocket size={14} />
      <span>Dispatch</span>
    </button>
  );
}
