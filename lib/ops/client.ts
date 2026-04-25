// Client-side fetchers + theme tokens shared across /ops components.
// Centralizing the dark palette here keeps the visual system consistent
// without duplicating colors across files.

import type {
  Agent,
  Campaign,
  CampaignControlAction,
  CreateCampaignInput,
  FeedEvent,
  OpsTickerSummary,
  SystemRules,
  WatchdogState,
} from './types';

export const opsTheme = {
  bg: '#06080c',
  surface: '#0c1118',
  surfaceRaised: '#11171f',
  border: 'rgba(120, 200, 220, 0.12)',
  borderStrong: 'rgba(120, 200, 220, 0.22)',
  text: '#e6edf3',
  textMuted: '#8b96a3',
  textDim: '#5b6573',
  // Accents
  green: '#00ff9c',  // electric green — primary accent
  greenDim: '#0ea968',
  gold: '#ffb547',
  blue: '#6cc7ff',
  red: '#ff5577',
  amber: '#ffb547',
  mono: 'IBM Plex Mono, ui-monospace, monospace',
  display: 'Rajdhani, system-ui, sans-serif',
  body: 'Space Grotesk, system-ui, sans-serif',
};

export function statusColor(s: string): string {
  switch (s) {
    case 'RUNNING':   return opsTheme.green;
    case 'DEPLOYING': return opsTheme.blue;
    case 'BLOCKED':   return opsTheme.red;
    case 'IDLE':      return opsTheme.amber;
    case 'COMPLETED': return opsTheme.textMuted;
    default:          return opsTheme.textMuted;
  }
}

export function levelColor(level: FeedEvent['level']): string {
  switch (level) {
    case 'success': return opsTheme.green;
    case 'warn':    return opsTheme.amber;
    case 'error':   return opsTheme.red;
    case 'info':
    default:        return opsTheme.blue;
  }
}

export function formatRelative(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// SWR fetcher
export const opsFetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
};

// Mutations
export async function dispatchCampaign(input: CreateCampaignInput): Promise<Campaign> {
  const res = await fetch('/api/ops/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Dispatch failed');
  return body.campaign as Campaign;
}

export async function controlCampaign(id: string, action: CampaignControlAction): Promise<Campaign> {
  const res = await fetch(`/api/ops/campaigns/${id}/control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Control action failed');
  return body.campaign as Campaign;
}

export async function patchSystemRules(patch: Partial<SystemRules>): Promise<SystemRules> {
  const res = await fetch('/api/ops/system-rules', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Failed to update rules');
  return body.rules as SystemRules;
}

export async function watchdogAction(action: 'force_resume_all' | 'escalate_all'): Promise<number> {
  const res = await fetch('/api/ops/watchdog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message ?? 'Watchdog action failed');
  return Number(body.count ?? 0);
}

export type {
  Agent,
  Campaign,
  CreateCampaignInput,
  FeedEvent,
  OpsTickerSummary,
  SystemRules,
  WatchdogState,
};
