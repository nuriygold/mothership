import useSWR from 'swr';
import { Dog, ShieldAlert, ShieldCheck, ExternalLink } from 'lucide-react';
import { OpsCard, OpsHeading, OpsLabel, OpsShell } from '@/components/ops/ops-shell';
import { opsFetcher, opsTheme, formatRelative } from '@/lib/ops/client';
import type { WatchdogState } from '@/lib/ops/types';

type UiWatchdogRoutePassResult = {
  mode: 'anonymous' | 'authenticated';
  name: string;
  path: string;
  url: string;
  status: 'pass' | 'fail';
  severity: 'pass' | 'warn' | 'fail';
  classification: 'pass' | 'route_fail' | 'shared_dependency_fail' | 'auth_fail' | 'warning_only';
  httpStatus: number | null;
  title: string | null;
  navPresent: boolean;
  fatal: string | null;
  finalPath: string;
  redirectPath: string | null;
  redirectAllowed: boolean;
  safeSelectorMatched: string | null;
  safeSelectorSatisfied: boolean;
  missingExpectedSelectors: string[];
  missingExpectedTitle: string[];
  navSatisfied: boolean;
  watchdogMode: 'anonymous' | 'authenticated';
  authObservedPath: string | null;
  consoleErrorCount: number;
  pageErrorCount: number;
  requestFailedCount: number;
  httpFailureCount: number;
  missingExpected: string[];
  screenshotPath?: string;
};

type UiWatchdogReport = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  watchdogMode: string;
  baseUrl: string;
  overall: 'pass' | 'fail';
  routeCount: number;
  failureCount: number;
  warningCount: number;
  rootCauseRollup: Array<{
    key: string;
    label: string;
    count: number;
    severity: 'warn' | 'fail';
  }>;
  normalizedDiagnostics: {
    hardFailReasons: string[];
    warningReasons: string[];
    httpFailures: Array<{ route: string; status: number; method: string; url: string }>;
    redirects: Array<{ route: string; from: string; to: string; allowed: boolean }>;
    sharedDependencyFailures: Array<{ route: string; url: string; status?: number | null; failure?: string | null }>;
    authFailures: Array<{ route: string; observedPath: string | null }>;
  };
  results: Array<UiWatchdogRoutePassResult & { watchdogMode: string; passResults?: UiWatchdogRoutePassResult[] }>;
};

async function reportFetcher(url: string): Promise<UiWatchdogReport | null> {
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function reasonFor(result: UiWatchdogReport['results'][number]) {
  return (
    (result.classification === 'auth_fail' ? `auth redirect: ${result.authObservedPath ?? 'unknown'}` : null) ??
    result.fatal ??
    (result.missingExpected[0] ? `missing expected text: ${result.missingExpected[0]}` : null) ??
    (result.missingExpectedSelectors[0] ? `missing selector: ${result.missingExpectedSelectors[0]}` : null) ??
    (result.missingExpectedTitle[0] ? `missing title text: ${result.missingExpectedTitle[0]}` : null) ??
    (!result.navPresent ? 'navigation missing' : null) ??
    (!result.redirectAllowed && result.redirectPath ? `unexpected redirect: ${result.redirectPath}` : null) ??
    (result.httpFailureCount ? `${result.httpFailureCount} http failures` : null) ??
    (result.requestFailedCount ? `${result.requestFailedCount} failed requests` : null) ??
    (result.pageErrorCount ? `${result.pageErrorCount} page errors` : null) ??
    (result.consoleErrorCount ? `${result.consoleErrorCount} console errors` : null) ??
    result.classification
  );
}

function badgeStyle(color: string) {
  return {
    border: `1px solid ${color}`,
    color,
    borderRadius: 999,
    padding: '2px 8px',
    fontFamily: opsTheme.mono,
    fontSize: 10,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  };
}

function listPreview(values: string[], empty = '—') {
  return values.length ? values.join(' · ') : empty;
}

function passTone(result: UiWatchdogRoutePassResult) {
  return result.severity === 'fail' ? opsTheme.red : result.severity === 'warn' ? opsTheme.amber : opsTheme.green;
}

export function WatchdogDashboard() {
  const { data: state } = useSWR<WatchdogState>('/api/ops/watchdog', opsFetcher, { refreshInterval: 8000 });
  const { data: report } = useSWR<UiWatchdogReport | null>('/api/watchdog/latest', reportFetcher, { refreshInterval: 15000 });

  const failures = report?.results.filter((result) => result.severity === 'fail') ?? [];
  const warnings = report?.results.filter((result) => result.severity === 'warn') ?? [];

  return (
    <OpsShell>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <OpsLabel>Mothership UI Route Watchdog</OpsLabel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <Dog size={20} style={{ color: opsTheme.amber }} />
            <OpsHeading level={1}>Mothership Watchdog</OpsHeading>
          </div>
        </div>
        <div style={{ fontFamily: opsTheme.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: report?.overall === 'fail' ? opsTheme.red : opsTheme.green }}>
          {report ? `${report.overall} · ${report.routeCount} routes · ${report.failureCount} failing` : 'No run yet'}
        </div>
      </header>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 16 }}>
        <OpsCard>
          <OpsLabel>Latest UI Route Run</OpsLabel>
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
          <OpsLabel>Ops Campaign Watchdog</OpsLabel>
          <div style={{ marginTop: 8, fontFamily: opsTheme.body, color: opsTheme.text, fontSize: 14 }}>
            {state?.inProgress.length ?? 0} in-progress campaigns
          </div>
          <div style={{ marginTop: 6, fontFamily: opsTheme.mono, fontSize: 10, color: opsTheme.textDim }}>
            {state?.uiWatchdog?.failureCount ?? 0} UI failures mirrored into ops
          </div>
        </OpsCard>
      </div>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', marginBottom: 16 }}>
        <OpsCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <OpsHeading level={3}>Root Cause Rollup</OpsHeading>
            <OpsLabel>{report?.rootCauseRollup.length ?? 0} causes</OpsLabel>
          </div>
          {!report?.rootCauseRollup.length ? (
            <div style={{ fontFamily: opsTheme.mono, fontSize: 11, color: opsTheme.textDim }}>No aggregated root causes yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {report.rootCauseRollup.slice(0, 8).map((cause) => (
                <div key={cause.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ fontFamily: opsTheme.mono, fontSize: 10, color: opsTheme.text }}>{cause.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={badgeStyle(cause.severity === 'fail' ? opsTheme.red : opsTheme.amber)}>{cause.severity}</span>
                    <span style={{ fontFamily: opsTheme.mono, fontSize: 10, color: opsTheme.textDim }}>{cause.count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </OpsCard>

        <OpsCard>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <OpsHeading level={3}>Normalized Diagnostics</OpsHeading>
            <OpsLabel>{report ? `${report.failureCount} fail · ${report.warningCount} warn` : 'No run'}</OpsLabel>
          </div>
          {!report ? (
            <div style={{ fontFamily: opsTheme.mono, fontSize: 11, color: opsTheme.textDim }}>No report loaded.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontFamily: opsTheme.mono, fontSize: 10, color: opsTheme.text }}>
              <div>Hard fail reasons: {listPreview(report.normalizedDiagnostics.hardFailReasons)}</div>
              <div>Warning reasons: {listPreview(report.normalizedDiagnostics.warningReasons)}</div>
              <div>Auth redirects: {report.normalizedDiagnostics.authFailures.length}</div>
              <div>Redirects seen: {report.normalizedDiagnostics.redirects.length}</div>
              <div>Shared dependency failures: {report.normalizedDiagnostics.sharedDependencyFailures.length}</div>
              <div>HTTP failures captured: {report.normalizedDiagnostics.httpFailures.length}</div>
            </div>
          )}
        </OpsCard>
      </div>

      <OpsCard>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
          <OpsHeading level={3}>Mothership UI Route Findings</OpsHeading>
          <OpsLabel>{failures.length} failing · {warnings.length} warning</OpsLabel>
        </div>

        {!report && (
          <div style={{ fontFamily: opsTheme.mono, fontSize: 11, color: opsTheme.textDim }}>
            No Mothership UI route watchdog report is available yet. Run <code>npm run ui-watchdog</code> in the Mothership repo.
          </div>
        )}

        {report && report.results.length === 0 && (
          <div style={{ fontFamily: opsTheme.mono, fontSize: 11, color: opsTheme.textDim }}>No routes recorded.</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report?.results.map((result) => {
            const tone = result.severity === 'fail' ? opsTheme.red : result.severity === 'warn' ? opsTheme.amber : opsTheme.green;
            const failing = result.severity === 'fail';
            const Icon = failing ? ShieldAlert : ShieldCheck;
            return (
              <div
                key={`${result.path}:${result.name}:${result.watchdogMode}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 10,
                  alignItems: 'start',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1px solid ${result.severity === 'fail' ? 'rgba(255,85,119,0.22)' : result.severity === 'warn' ? 'rgba(245,158,11,0.22)' : opsTheme.border}`,
                  background: result.severity === 'fail' ? 'rgba(255,85,119,0.05)' : result.severity === 'warn' ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <Icon size={16} style={{ color: tone, marginTop: 2 }} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: opsTheme.body, fontSize: 13, color: opsTheme.text, fontWeight: 600 }}>{result.name}</span>
                    <span style={{ fontFamily: opsTheme.mono, fontSize: 10, color: opsTheme.textDim }}>{result.path}</span>
                    <span style={{ fontFamily: opsTheme.mono, fontSize: 10, color: result.httpStatus && result.httpStatus >= 400 ? opsTheme.red : opsTheme.textDim }}>
                      HTTP {result.httpStatus ?? '—'}
                    </span>
                    <span style={badgeStyle(tone)}>{result.severity}</span>
                    <span style={badgeStyle(opsTheme.blue)}>{result.classification}</span>
                    <span style={badgeStyle(opsTheme.textDim)}>{result.watchdogMode}</span>
                  </div>
                  <div style={{ marginTop: 4, fontFamily: opsTheme.mono, fontSize: 10, color: tone }}>
                    {reasonFor(result)}
                  </div>
                  <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 6, fontFamily: opsTheme.mono, fontSize: 10, color: opsTheme.textDim }}>
                    <div>Auth path: {result.authObservedPath ?? '—'}</div>
                    <div>Final path: {result.finalPath}</div>
                    <div>Redirect: {result.redirectPath ?? '—'} {result.redirectAllowed ? 'allowed' : 'blocked'}</div>
                    <div>Safe selector: {result.safeSelectorMatched ?? '—'} {result.safeSelectorSatisfied ? 'ok' : 'missing'}</div>
                    <div>Expected selectors: {listPreview(result.missingExpectedSelectors, 'ok')}</div>
                    <div>Expected title: {listPreview(result.missingExpectedTitle, 'ok')}</div>
                    <div>Expected text: {listPreview(result.missingExpected, 'ok')}</div>
                    <div>Navigation: {result.navPresent ? 'present' : 'missing'}</div>
                    <div>Console errors: {result.consoleErrorCount}</div>
                    <div>Page errors: {result.pageErrorCount}</div>
                    <div>Request failures: {result.requestFailedCount}</div>
                    <div>HTTP failures: {result.httpFailureCount}</div>
                  </div>
                  {!!result.passResults?.length && (
                    <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                      {result.passResults.map((pass) => {
                        const tone = passTone(pass);
                        return (
                          <div key={`${result.path}:${pass.mode}`} style={{ border: `1px solid ${tone}`, borderRadius: 8, padding: '8px 10px', background: 'rgba(255,255,255,0.02)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                              <span style={badgeStyle(tone)}>{pass.mode}</span>
                              <span style={badgeStyle(tone)}>{pass.severity}</span>
                              <span style={badgeStyle(opsTheme.blue)}>{pass.classification}</span>
                            </div>
                            <div style={{ display: 'grid', gap: 4, fontFamily: opsTheme.mono, fontSize: 10, color: opsTheme.textDim }}>
                              <div>Auth path: {pass.authObservedPath ?? '—'}</div>
                              <div>Final path: {pass.finalPath}</div>
                              <div>Redirect: {pass.redirectPath ?? '—'} {pass.redirectAllowed ? 'allowed' : 'blocked'}</div>
                              <div>Safe selector: {pass.safeSelectorMatched ?? '—'} {pass.safeSelectorSatisfied ? 'ok' : 'missing'}</div>
                              <div>Expected selectors: {listPreview(pass.missingExpectedSelectors, 'ok')}</div>
                              <div>Expected title: {listPreview(pass.missingExpectedTitle, 'ok')}</div>
                              <div>Expected text: {listPreview(pass.missingExpected, 'ok')}</div>
                              <div>Navigation: {pass.navPresent ? 'present' : 'missing'}</div>
                              <div>HTTP {pass.httpStatus ?? '—'} · request {pass.requestFailedCount} · response {pass.httpFailureCount}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
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
