'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronsUp, Play, RefreshCw, Square } from 'lucide-react';
import { controlCampaign, opsTheme } from '@/lib/ops/client';
import type { CampaignControlAction } from '@/lib/ops/types';
import { OpsCard, OpsHeading } from './ops-shell';

const CONTROLS: Array<{
  action: CampaignControlAction;
  label: string;
  Icon: typeof Play;
  tone: 'green' | 'blue' | 'amber' | 'red';
  confirm?: string;
}> = [
  { action: 'resume',         label: 'Resume Execution', Icon: Play,        tone: 'green' },
  { action: 'force_retry',    label: 'Force Retry',      Icon: RefreshCw,   tone: 'blue' },
  { action: 'approve_action', label: 'Approve Action',   Icon: CheckCircle2, tone: 'green' },
  { action: 'escalate',       label: 'Escalate',         Icon: ChevronsUp,  tone: 'amber' },
  { action: 'kill',           label: 'Kill Task',        Icon: Square,      tone: 'red',
    confirm: 'Kill this campaign? This cannot be undone.' },
];

export function ExecutionControls({
  campaignId,
  onAfterAction,
}: {
  campaignId: string;
  onAfterAction: () => void;
}) {
  const [busy, setBusy] = useState<CampaignControlAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: CampaignControlAction, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(action);
    setError(null);
    try {
      await controlCampaign(campaignId, action);
      onAfterAction();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <OpsCard>
      <OpsHeading level={3}>Execution Controls</OpsHeading>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 8,
          marginTop: 12,
        }}
      >
        {CONTROLS.map(({ action, label, Icon, tone, confirm }) => {
          const accent =
            tone === 'green' ? opsTheme.green :
            tone === 'blue'  ? opsTheme.blue :
            tone === 'amber' ? opsTheme.amber :
            opsTheme.red;
          const isBusy = busy === action;
          return (
            <button
              key={action}
              type="button"
              onClick={() => run(action, confirm)}
              disabled={busy !== null}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 8,
                border: `1px solid ${accent}40`,
                background: `${accent}0d`,
                color: accent,
                fontFamily: opsTheme.mono,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy && !isBusy ? 0.5 : 1,
                transition: 'background 120ms ease',
              }}
            >
              <Icon size={13} />
              <span>{isBusy ? '…' : label}</span>
            </button>
          );
        })}
      </div>
      {error && (
        <div
          style={{
            marginTop: 10,
            padding: 8,
            borderRadius: 6,
            border: '1px solid rgba(255,85,119,0.25)',
            background: 'rgba(255,85,119,0.08)',
            fontFamily: opsTheme.mono,
            fontSize: 11,
            color: opsTheme.red,
          }}
        >
          {error}
        </div>
      )}
    </OpsCard>
  );
}
