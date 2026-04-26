'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ActiveCampaignsPanel } from '@/components/ops/active-campaigns-panel';
import { DispatchFab } from '@/components/ops/dispatch-fab';
import { DispatchModal } from '@/components/ops/dispatch-modal';
import { OpsHeading, OpsLabel, OpsShell } from '@/components/ops/ops-shell';
import { SystemRulesPanel } from '@/components/ops/system-rules-panel';
import { SystemStatusTicker } from '@/components/ops/system-status-ticker';
import { WatchdogPanel } from '@/components/ops/watchdog-panel';
import { opsFetcher, opsTheme } from '@/lib/ops/client';
import type {
  Agent,
  Campaign,
  OpsTickerSummary,
  SystemRules,
  WatchdogState,
} from '@/lib/ops/types';

export default function OpsPage() {
  const [showDispatch, setShowDispatch] = useState(false);

  const { data: campaignsData, mutate: mutateCampaigns, isLoading } = useSWR<{
    campaigns: Campaign[];
    ticker: OpsTickerSummary;
  }>('/api/ops/campaigns', opsFetcher, { refreshInterval: 4000 });

  const { data: agentsData } = useSWR<{ agents: Agent[] }>('/api/ops/agents', opsFetcher, {
    refreshInterval: 30_000,
  });

  const { data: rulesData, mutate: mutateRules } = useSWR<{ rules: SystemRules }>(
    '/api/ops/system-rules',
    opsFetcher,
    { refreshInterval: 60_000 }
  );

  const { data: watchdogData, mutate: mutateWatchdog } = useSWR<WatchdogState>(
    '/api/ops/watchdog',
    opsFetcher,
    { refreshInterval: 8000 }
  );

  const campaigns = campaignsData?.campaigns ?? [];
  const ticker = campaignsData?.ticker ?? null;
  const agents = agentsData?.agents ?? [];
  const rules = rulesData?.rules ?? null;
  const watchdog = watchdogData ?? null;

  return (
    <OpsShell>
      {/* Header strip */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <OpsLabel>Mothership · Control Plane</OpsLabel>
          <OpsHeading level={1} style={{ marginTop: 6, color: opsTheme.text }}>
            Ops
          </OpsHeading>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: opsTheme.mono,
            fontSize: 10,
            color: opsTheme.textMuted,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: opsTheme.green,
              boxShadow: `0 0 8px ${opsTheme.green}`,
              animation: 'opsPulse 1.4s ease-in-out infinite',
            }}
          />
          Live · {ticker?.activeCampaigns ?? 0} active
        </div>
      </header>

      {/* Status ticker */}
      <div style={{ marginBottom: 14 }}>
        <SystemStatusTicker summary={ticker} />
      </div>

      {/* Active campaigns */}
      <div style={{ marginBottom: 16 }}>
        <ActiveCampaignsPanel campaigns={campaigns} agents={agents} loading={isLoading} />
      </div>

      {/* Watchdog + System Rules */}
      <div
        style={{
          display: 'grid',
          gap: 10,
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        }}
      >
        <WatchdogPanel state={watchdog} onAfterAction={() => { void mutateWatchdog(); void mutateCampaigns(); }} />
        <SystemRulesPanel
          rules={rules}
          onUpdated={(next) => mutateRules({ rules: next }, false)}
        />
      </div>

      <DispatchFab onClick={() => setShowDispatch(true)} />

      {showDispatch && (
        <DispatchModal
          agents={agents}
          onClose={() => setShowDispatch(false)}
          onDispatched={() => { void mutateCampaigns(); }}
        />
      )}
    </OpsShell>
  );
}
