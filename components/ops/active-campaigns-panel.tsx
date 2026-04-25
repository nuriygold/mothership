'use client';

import { opsTheme } from '@/lib/ops/client';
import type { Agent, Campaign } from '@/lib/ops/types';
import { CampaignCard } from './campaign-card';
import { OpsHeading, OpsLabel } from './ops-shell';

export function ActiveCampaignsPanel({
  campaigns,
  agents,
  loading,
}: {
  campaigns: Campaign[];
  agents: Agent[];
  loading: boolean;
}) {
  const agentById = new Map(agents.map((a) => [a.id, a]));

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <OpsHeading level={2}>Active Campaigns</OpsHeading>
        <OpsLabel>{campaigns.length} mission{campaigns.length === 1 ? '' : 's'} in queue</OpsLabel>
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
