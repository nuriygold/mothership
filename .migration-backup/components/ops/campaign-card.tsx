'use client';

import Link from 'next/link';
import { Activity, AlertTriangle, FileText, Layers, Rows3 } from 'lucide-react';
import { formatRelative, opsTheme, statusColor } from '@/lib/ops/client';
import type { Agent, Campaign } from '@/lib/ops/types';
import { OpsCard } from './ops-shell';

export function CampaignCard({ campaign, agent }: { campaign: Campaign; agent: Agent | undefined }) {
  const accent = statusColor(campaign.status);
  const isLive = campaign.status === 'RUNNING' || campaign.status === 'DEPLOYING';

  return (
      <Link href={{ pathname: `/ops/campaigns/${campaign.id}` }} style={{ textDecoration: 'none' }}>
      <OpsCard
        glow={isLive}
        style={{
          cursor: 'pointer',
          transition: 'transform 120ms ease, border-color 120ms ease',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontFamily: opsTheme.display,
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: opsTheme.text,
                lineHeight: 1.15,
              }}
            >
              {campaign.name}
            </div>
            <div
              style={{
                fontFamily: opsTheme.mono,
                fontSize: 10,
                color: opsTheme.textDim,
                marginTop: 4,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Lead · {agent?.name ?? '—'} · {agent?.domain ?? '—'}
            </div>
          </div>

          <StatusPill status={campaign.status} accent={accent} live={isLive} />
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              height: 4,
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
                boxShadow: `0 0 10px ${accent}80`,
                transition: 'width 400ms ease',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: opsTheme.mono,
              fontSize: 10,
              color: opsTheme.textDim,
              marginTop: 6,
              letterSpacing: '0.08em',
            }}
          >
            <span>{Math.round(campaign.progress * 100)}% · {campaign.artifacts.length} artifacts</span>
            <span>{formatRelative(campaign.lastActivityAt)}</span>
          </div>
        </div>

        {/* Quick stats */}
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
          <Stat icon={<FileText size={12} />} label="Files" value={campaign.quickStats.filesUpdated} />
          <Stat icon={<Rows3 size={12} />} label="Rows" value={campaign.quickStats.rowsProcessed.toLocaleString()} />
          <Stat icon={<Layers size={12} />} label="Batches" value={campaign.quickStats.batchCount} />
        </div>

        {/* Blocker indicator */}
        {campaign.blocker && (
          <div
            style={{
              marginTop: 10,
              padding: '6px 8px',
              borderRadius: 6,
              background: 'rgba(255,85,119,0.08)',
              border: '1px solid rgba(255,85,119,0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontFamily: opsTheme.mono,
              fontSize: 10,
              color: opsTheme.red,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            <AlertTriangle size={12} />
            <span>{campaign.blocker.type} · attempt {campaign.blocker.attempts}/{3}</span>
          </div>
        )}
      </OpsCard>
    </Link>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: opsTheme.textDim }}>
        {icon}
        <span style={{ fontFamily: opsTheme.mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: opsTheme.display,
          fontSize: 18,
          fontWeight: 600,
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

export function StatusPill({ status, accent, live }: { status: string; accent: string; live?: boolean }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        background: `${accent}14`,
        border: `1px solid ${accent}40`,
        color: accent,
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 10,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: accent,
          boxShadow: `0 0 8px ${accent}`,
          animation: live ? 'opsPulse 1.4s ease-in-out infinite' : 'none',
        }}
      />
      <Activity size={10} style={{ display: 'none' }} />
      {status}
    </span>
  );
}
