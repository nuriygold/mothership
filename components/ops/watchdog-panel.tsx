'use client';

import { useState } from 'react';
import { Eye, ShieldAlert } from 'lucide-react';
import { formatRelative, opsTheme, watchdogAction } from '@/lib/ops/client';
import type { WatchdogState } from '@/lib/ops/types';
import { OpsCard, OpsHeading, OpsLabel } from './ops-shell';

export function WatchdogPanel({
  state,
  onAfterAction,
}: {
  state: WatchdogState | null;
  onAfterAction: () => void;
}) {
  const [busy, setBusy] = useState<null | 'force_resume_all' | 'escalate_all'>(null);

  const items = state?.inProgress ?? [];
  const flagged = items.filter((i) => i.isStale || i.isMissingArtifacts || i.hasInvalidBlocker);

  async function run(action: 'force_resume_all' | 'escalate_all') {
    setBusy(action);
    try {
      await watchdogAction(action);
      onAfterAction();
    } finally {
      setBusy(null);
    }
  }

  return (
    <OpsCard>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Eye size={14} style={{ color: opsTheme.green }} />
          <OpsHeading level={3}>Watchdog</OpsHeading>
        </div>
        <OpsLabel>
          {items.length} in-progress · {flagged.length} flagged
        </OpsLabel>
      </div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.length === 0 && (
          <div
            style={{
              fontFamily: opsTheme.mono,
              fontSize: 11,
              color: opsTheme.textDim,
              padding: 8,
            }}
          >
            No active campaigns to watch.
          </div>
        )}
        {items.map((item) => {
          const flaggedReasons: string[] = [];
          if (item.isStale) flaggedReasons.push('stale');
          if (item.isMissingArtifacts) flaggedReasons.push('missing artifacts');
          if (item.hasInvalidBlocker) flaggedReasons.push('invalid blocker');
          const isFlagged = flaggedReasons.length > 0;
          return (
            <div
              key={item.campaignId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 10px',
                borderRadius: 8,
                background: isFlagged ? 'rgba(255,85,119,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isFlagged ? 'rgba(255,85,119,0.2)' : opsTheme.border}`,
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: opsTheme.body,
                    fontSize: 12,
                    color: opsTheme.text,
                    fontWeight: 500,
                  }}
                >
                  {item.name}
                </div>
                <div
                  style={{
                    fontFamily: opsTheme.mono,
                    fontSize: 10,
                    color: opsTheme.textDim,
                    marginTop: 2,
                    letterSpacing: '0.06em',
                  }}
                >
                  {item.leadAgentName} · {formatRelative(item.lastActivityAt)}
                  {isFlagged && (
                    <span style={{ color: opsTheme.red, marginLeft: 8, textTransform: 'uppercase' }}>
                      · {flaggedReasons.join(' · ')}
                    </span>
                  )}
                </div>
              </div>
              {isFlagged && <ShieldAlert size={14} style={{ color: opsTheme.red, flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
        <WatchdogButton
          onClick={() => run('force_resume_all')}
          disabled={busy !== null}
          loading={busy === 'force_resume_all'}
          label="Force Resume All"
          tone="green"
        />
        <WatchdogButton
          onClick={() => run('escalate_all')}
          disabled={busy !== null}
          loading={busy === 'escalate_all'}
          label="Escalate All Blockers"
          tone="amber"
        />
      </div>
    </OpsCard>
  );
}

function WatchdogButton({
  label,
  onClick,
  disabled,
  loading,
  tone,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  loading: boolean;
  tone: 'green' | 'amber';
}) {
  const accent = tone === 'green' ? opsTheme.green : opsTheme.amber;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '8px 10px',
        borderRadius: 8,
        border: `1px solid ${accent}40`,
        background: `${accent}10`,
        color: accent,
        fontFamily: opsTheme.mono,
        fontSize: 10,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled && !loading ? 0.5 : 1,
        fontWeight: 500,
      }}
    >
      {loading ? '…' : label}
    </button>
  );
}
