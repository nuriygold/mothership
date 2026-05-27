export type UiWatchdogRouteResult = {
  name: string;
  path: string;
  url: string;
  status: 'pass' | 'fail';
  httpStatus: number | null;
  title: string | null;
  navPresent: boolean;
  fatal: string | null;
  consoleErrorCount: number;
  consoleErrors: string[];
  pageErrorCount: number;
  pageErrors: string[];
  requestFailedCount: number;
  requestFailures: Array<{ url: string; method: string; failure: string }>;
  missingExpected: string[];
  screenshotPath?: string;
};

export type UiWatchdogRun = {
  runId: string;
  startedAt: string;
  baseUrl: string;
  overall: 'pass' | 'fail';
  routeCount: number;
  failureCount: number;
  results: UiWatchdogRouteResult[];
};
