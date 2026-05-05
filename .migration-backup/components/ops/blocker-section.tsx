'use client';

import { AlertTriangle } from 'lucide-react';
import { formatRelative, opsTheme } from '@/lib/ops/client';
import type { CampaignBlocker } from '@/lib/ops/types';
import { OpsHeading } from './ops-shell';

export function BlockerSection({ blocker }: { blocker: CampaignBlocker }) {
  return (
    <div
      style={{
        background: 'rgba(255,85,119,0.06)',
        border: `1px solid rgba(255,85,119,0.3)`,
        borderRadius: 12,
        padding: 14,
        boxShadow: '0 0 0 1px rgba(255,85,119,0.08), 0 8px 28px rgba(255,85,119,0.06)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <AlertTriangle size={14} style={{ color: opsTheme.red }} />
        <OpsHeading level={3} style={{ color: opsTheme.red }}>
          Blocker Detected
        </OpsHeading>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: opsTheme.mono,
            fontSize: 10,
            color: opsTheme.textDim,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          {formatRelative(blocker.detectedAt)}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginTop: 12,
        }}
      >
        <BlockerStat label="Type" value={blocker.type} mono />
        <BlockerStat label="Attempts" value={String(blocker.attempts)} />
        <BlockerStat label="Required Input" value={blocker.requiredInput} mono />
      </div>
    </div>
  );
}

function BlockerStat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div
        style={{
          fontFamily: opsTheme.mono,
          fontSize: 9,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: opsTheme.textDim,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontFamily: mono ? opsTheme.mono : opsTheme.body,
          fontSize: 13,
          color: opsTheme.text,
          fontWeight: 500,
          wordBreak: 'break-all',
        }}
      >
        {value}
      </div>
    </div>
  );
}
