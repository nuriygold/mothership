export type UiWatchdogRoutePassResult = {
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
  expectedStatus: number[];
  statusAllowed: boolean;
  safeSelectorMatched: string | null;
  safeSelectorSatisfied: boolean;
  missingExpectedSelectors: string[];
  missingExpectedTitle: string[];
  navSatisfied: boolean;
  watchdogMode: 'anonymous' | 'authenticated';
  authSatisfied: boolean;
  authObservedPath: string | null;
  consoleErrorCount: number;
  consoleErrors: string[];
  pageErrorCount: number;
  pageErrors: string[];
  requestFailedCount: number;
  requestFailures: Array<{ url: string; method: string; failure: string }>;
  httpFailureCount: number;
  httpFailures: Array<{ url: string; status: number; method: string; resourceType: string }>;
  matchingConsoleFailureCount: number;
  matchingConsoleFailures: string[];
  missingExpected: string[];
  screenshotPath?: string;
};

export type UiWatchdogRouteResult = UiWatchdogRoutePassResult & {
  watchdogMode: string;
  passResults?: UiWatchdogRoutePassResult[];
};

export type UiWatchdogRun = {
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
  rootCauseRollup: Array<{ key: string; label: string; count: number; severity: 'warn' | 'fail' }>;
  normalizedDiagnostics: {
    hardFailReasons: string[];
    warningReasons: string[];
    httpFailures: Array<{ route: string; status: number; method: string; url: string }>;
    redirects: Array<{ route: string; from: string; to: string; allowed: boolean }>;
    sharedDependencyFailures: Array<{ route: string; url: string; status?: number | null; failure?: string | null }>;
    authFailures: Array<{ route: string; observedPath: string | null }>;
  };
  results: UiWatchdogRouteResult[];
};
