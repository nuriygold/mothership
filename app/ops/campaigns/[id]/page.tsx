'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft } from 'lucide-react';
import { ArtifactPanel } from '@/components/ops/artifact-panel';
import { BlockerSection } from '@/components/ops/blocker-section';
import { StatusPill } from '@/components/ops/campaign-card';
import { ExecutionControls } from '@/components/ops/execution-controls';
import { LiveExecutionFeed } from '@/components/ops/live-execution-feed';
import { OpsCard, OpsHeading, OpsLabel, OpsShell } from '@/components/ops/ops-shell';
import { formatRelative, opsFetcher, opsTheme, statusColor } from '@/lib/ops/client';
import type { Agent, Campaign } from '@/lib/ops/types';

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';

  const { data, error, mutate, isLoading } = useSWR<{ campaign: Campaign; leadAgent: Agent | null }>(
    id ? `/api/ops/campaigns/${id}` : null,
    opsFetcher,
    { refreshInterval: 4000 }
  );

  if (isLoading) {
    return (
      <OpsShell>
        <BackLink />
        <div
          style={{
            fontFamily: opsTheme.mono,
            fontSize: 12,
            color: opsTheme.textDim,
            padding: 24,
            textAlign: 'center',
          }}
        >
          Loading campaign…
        </div>
      </OpsShell>
    );
  }

  if (error || !data?.campaign) {
    return (
      <OpsShell>
        <BackLink />
        <OpsCard>
          <OpsHeading level={2}>Campaign not found</OpsHeading>
          <p
            style={{
              fontFamily: opsTheme.mono,
              fontSize: 12,
              color: opsTheme.textDim,
              marginTop: 8,
            }}
          >
            The requested campaign does not exist or has been killed.
          </p>
        </OpsCard>
      </OpsShell>
    );
  }

  const { campaign, leadAgent } = data;
  const accent = statusColor(campaign.status);
  const isLive = campaign.status === 'RUNNING' || campaign.status === 'DEPLOYING';

  return (
    <OpsShell>
      <BackLink />

      {/* Title strip */}
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <OpsLabel>Campaign · {campaign.id}</OpsLabel>
          <OpsHeading level={1} style={{ marginTop: 4, color: opsTheme.text }}>
            {campaign.name}
          </OpsHeading>
          <p
            style={{
              fontFamily: opsTheme.body,
              fontSize: 13,
              color: opsTheme.textMuted,
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            {campaign.objective}
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 10,
              fontFamily: opsTheme.mono,
              fontSize: 10,
              color: opsTheme.textDim,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            <span>Lead · {leadAgent?.name ?? '—'} · {leadAgent?.domain ?? '—'}</span>
            <span>Started · {formatRelative(campaign.startedAt)}</span>
            <span>Last activity · {formatRelative(campaign.lastActivityAt)}</span>
            <span>Mode · {campaign.executionMode}</span>
            <span>Min batch · {campaign.minimumBatchSize}</span>
          </div>
        </div>
        <StatusPill status={campaign.status} accent={accent} live={isLive} />
      </header>

      {/* Progress strip */}
      <OpsCard style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <OpsLabel>Mission Progress</OpsLabel>
          <span style={{ fontFamily: opsTheme.mono, fontSize: 11, color: accent, letterSpacing: '0.06em' }}>
            {Math.round(campaign.progress * 100)}%
          </span>
        </div>
        <div
          style={{
            height: 6,
            background: 'rgba(255,255,255,0.04)',
            borderRadius: 999,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.round(campaign.progress * 100)}%`,
              height: '100%',
              background: accent,
              boxShadow: `0 0 12px ${accent}80`,
              transition: 'width 400ms ease',
            }}
          />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginTop: 12,
            paddingTop: 12,
            borderTop: `1px solid ${opsTheme.border}`,
          }}
        >
          <DetailStat label="Files updated" value={campaign.quickStats.filesUpdated.toLocaleString()} />
          <DetailStat label="Rows processed" value={campaign.quickStats.rowsProcessed.toLocaleString()} />
          <DetailStat label="Batches" value={campaign.quickStats.batchCount.toLocaleString()} />
        </div>
      </OpsCard>

      {/* Blocker (if present) */}
      {campaign.blocker && (
        <div style={{ marginBottom: 12 }}>
          <BlockerSection blocker={campaign.blocker} />
        </div>
      )}

      {/* Live feed (full width on small screens, primary column on desktop) */}
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <LiveExecutionFeed campaignId={campaign.id} initialEvents={campaign.feed} />

        {/* Two-column row: artifacts | controls */}
        <div
          style={{
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          }}
        >
          <ArtifactPanel artifacts={campaign.artifacts} />
          <ExecutionControls campaignId={campaign.id} onAfterAction={() => { void mutate(); }} />
        </div>
      </div>
    </OpsShell>
  );
}

function BackLink() {
  return (
    <Link
      href="/ops"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        textDecoration: 'none',
        fontFamily: opsTheme.mono,
        fontSize: 11,
        color: opsTheme.textMuted,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      <ArrowLeft size={12} />
      Back to Ops
    </Link>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
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
          fontFamily: opsTheme.display,
          fontSize: 22,
          fontWeight: 700,
          color: opsTheme.text,
          marginTop: 2,
          letterSpacing: '0.02em',
        }}
      >
        {value}
      </div>
    </div>
  );
}
