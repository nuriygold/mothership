import useSWR from 'swr';
import { Dog, ShieldAlert, ShieldCheck, ExternalLink } from 'lucide-react';
import { OpsCard, OpsHeading, OpsLabel, OpsShell } from '@/components/ops/ops-shell';
import { opsFetcher, opsTheme, formatRelative } from '@/lib/ops/client';
import type { WatchdogState } from '@/lib/ops/types';

type UiWatchdogReport = {
  runId: string;
  startedAt: string;
  baseUrl: string;
  overall: 'pass' | 'fail';
  routeCount: number;
  failureCount: number;
  results: Array<{
    name: string;
    path: string;
    url: string;
    status: 'pass' | 'fail';
    httpStatus: number | null;
    title: string | null;
    navPresent: boolean;
    fatal: string | null;
    consoleErrorCount: number;
    pageErrorCount: number;
    requestFailedCount: number;
    missingExpected: string[];
    screenshotPath?: string;
  }>;
};

async function reportFetcher(url: string): Promise<UiWatchdogReport | null> {
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function reasonFor(result: UiWatchdogReport['results'][number]) {
  return (
    result.fatal ??
    (result.missingExpected[0] ? `missing expected text: ${result.missingExpected[0]}` : null) ??
    (result.requestFailedCount ? `${result.requestFailedCount} failed requests` : null) ??
    (result.consoleErrorCount ? `${result.consoleErrorCount} console errors` : null) ??
    (result.pageErrorCount ? `${result.pageErrorCount} page errors` : null) ??
    'ok'
  );
}

export function WatchdogDashboard() {
  const { data: state } = useSWR<WatchdogState>('/api/ops/watchdog', opsFetcher, { refreshInterval: 8000 });
  const { data: report } = useSWR<UiWatchdogReport | null>('/api/watchdog/latest', reportFetcher, { refreshInterval: 15000 });

  const failures = report?.results.filter((result) => result.status === 'fail') ?? [];

  return (
    <OpsShell>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <OpsLabel>Good Dog · UI Patrol</OpsLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <Dog size={20} style={{ color: opsTheme.amber }} />
            <OpsHeading level={1}>Watchdog</OpsHeading>
          </div>
        </div>
        <div style={{ fontFamily: opsTheme.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: report?.overall === 'fail' ? opsTheme.red : opsTheme.green }}>
          {report ? `${report.overall} · ${report.routeCount} routes · ${report.failureCount} failing` : 'No run yet'}
        </div>
      </header>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 16 }}>
        <OpsCard>
          <OpsLabel>Latest Run</OpsLabel>
          <div style={{ marginTop: 8, fontFamily: opsTheme.body, color: opsTheme.text, fontSize: 14 }}>
            {report ? formatRelative(report.startedAt) : 'No report found'}
          </div>
          {report && (
            <div style={{ marginTop: 6, fontFamily: opsTheme.mono, fontSize: 10, color: opsTheme.textDim }}>
              {report.runId} · {report.baseUrl}
            </div>
          )}
        </OpsCard>

        <OpsCard>
          <OpsLabel>Ops Watchdog</OpsLabel>
          <div style={{ marginTop: 8, fontFamily: opsTheme.body, color: opsTheme.text, fontSize: 14 }}>
            {state?.inProgress.length ?? 0} in-progress campaigns
          </div>
          <div style={{ marginTop: 6, fontFamily: opsTheme.mono, fontSize: 10, color: opsTheme.textDim }}>
            {state?.uiWatchdog?.failureCount ?? 0} UI failures mirrored into ops
          </div>
        </OpsCard>
      </div>

      <OpsCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <OpsHeading level={3}>Route Findings</OpsHeading>
          <OpsLabel>{failures.length} failing</OpsLabel>
        </div>

        {!report && (
          <div style={{ fontFamily: opsTheme.mono, fontSize: 11, color: opsTheme.textDim }}>
            No watchdog report available yet. Run <code>npm run ui-watchdog</code> in the Mothership repo.
          </div>
        )}

        {report && report.results.length === 0 && (
          <div style={{ fontFamily: opsTheme.mono, fontSize: 11, color: opsTheme.textDim }}>No routes recorded.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report?.results.map((result) => {
            const failing = result.status === 'fail';
            const Icon = failing ? ShieldAlert : ShieldCheck;
            return (
              <div
                key={`${result.path}:${result.name}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 10,
                  alignItems: 'start',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${failing ? 'rgba(255,85,119,0.22)' : opsTheme.border}`,
                  background: failing ? 'rgba(255,85,119,0.05)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <Icon size={16} style={{ color: failing ? opsTheme.red : opsTheme.green, marginTop: 2 }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: opsTheme.body, fontSize: 13, color: opsTheme.text, fontWeight: 600 }}>{result.name}</span>
                    <span style={{ fontFamily: opsTheme.mono, fontSize: 10, color: opsTheme.textDim }}>{result.path}</span>
                    <span style={{ fontFamily: opsTheme.mono, fontSize: 10, color: result.httpStatus && result.httpStatus >= 400 ? opsTheme.red : opsTheme.textDim }}>
                      HTTP {result.httpStatus ?? '—'}
                    </span>
                  </div>
                  <div style={{ marginTop: 4, fontFamily: opsTheme.mono, fontSize: 10, color: failing ? opsTheme.red : opsTheme.textDim }}>
                    {reasonFor(result)}
                  </div>
                </div>
                <a href={result.url} target="_blank" rel="noreferrer" style={{ color: opsTheme.blue, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: opsTheme.mono, fontSize: 10 }}>
                  Open <ExternalLink size={12} />
                </a>
              </div>
            );
          })}
        </div>
      </OpsCard>
    </OpsShell>
  );
}
