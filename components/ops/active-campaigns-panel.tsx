'use client';

import { useState } from 'react';
import { clearDemoMissions, loadDemoMissions, opsTheme } from '@/lib/ops/client';
import type { Agent, Campaign } from '@/lib/ops/types';
import { CampaignCard } from './campaign-card';
import { OpsHeading, OpsLabel } from './ops-shell';

export function ActiveCampaignsPanel({
  campaigns,
  agents,
  loading,
  onMutated,
}: {
  campaigns: Campaign[];
  agents: Agent[];
  loading: boolean;
  onMutated?: () => void;
}) {
  const agentById = new Map(agents.map((a) => [a.id, a]));
  const [seeding, setSeeding] = useState(false);
  const hasDemo = campaigns.some((c) => c.name.startsWith('Demo:'));

  async function handleLoadDemo() {
    setSeeding(true);
    try {
      await loadDemoMissions();
      onMutated?.();
    } finally {
      setSeeding(false);
    }
  }

  async function handleClearDemo() {
    setSeeding(true);
    try {
      await clearDemoMissions();
      onMutated?.();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
        <OpsHeading level={2}>Active Campaigns</OpsHeading>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <OpsLabel>{campaigns.length} mission{campaigns.length === 1 ? '' : 's'} in queue</OpsLabel>
          {hasDemo && (
            <button
              type="button"
              onClick={handleClearDemo}
              disabled={seeding}
              style={{
                fontFamily: opsTheme.mono,
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: opsTheme.textDim,
                background: 'transparent',
                border: `1px solid ${opsTheme.border}`,
                borderRadius: 6,
                padding: '4px 8px',
                cursor: seeding ? 'wait' : 'pointer',
              }}
            >
              Clear demo
            </button>
          )}
        </div>
      </div>

      {loading && campaigns.length === 0 && (
        <div
          style={{
            fontFamily: opsTheme.mono,
            fontSize: 11,
            color: opsTheme.textDim,
            padding: 16,
            border: `1px solid ${opsTheme.border}`,
            borderRadius: 12,
            textAlign: 'center',
          }}
        >
          Initializing control plane…
        </div>
      )}

      {!loading && campaigns.length === 0 && (
        <div
          style={{
            fontFamily: opsTheme.mono,
            fontSize: 11,
            color: opsTheme.textMuted,
            padding: '28px 20px',
            border: `1px dashed ${opsTheme.border}`,
            borderRadius: 12,
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              fontFamily: opsTheme.display,
              fontSize: 14,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: opsTheme.text,
              marginBottom: 6,
            }}
          >
            No missions in flight
          </div>
          Dispatch a mission to start a durable workflow run.
          <br />
          Each mission spins up a WDK workflow that produces required artifacts via Vercel AI Gateway.
          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleLoadDemo}
              disabled={seeding}
              style={{
                fontFamily: opsTheme.mono,
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: opsTheme.green,
                background: `${opsTheme.green}1a`,
                border: `1px solid ${opsTheme.green}`,
                borderRadius: 8,
                padding: '8px 14px',
                cursor: seeding ? 'wait' : 'pointer',
                boxShadow: `0 0 18px ${opsTheme.green}30`,
              }}
            >
              {seeding ? 'Loading…' : 'Load demo missions'}
            </button>
            <span style={{ fontSize: 10, color: opsTheme.textDim, alignSelf: 'center' }}>
              or use the Dispatch button to start a real workflow
            </span>
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gap: 10,
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        }}
      >
        {campaigns.map((c) => (
          <CampaignCard key={c.id} campaign={c} agent={agentById.get(c.leadAgentId)} />
        ))}
      </div>
    </section>
  );
}
