import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.MOTHERSHIP_BASE_URL || 'http://127.0.0.1:4173';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'runtime/ui-watchdog');
const TIMEOUT_MS = Number(process.env.UI_WATCHDOG_TIMEOUT_MS || 15000);
const WATCHDOG_MODE = process.env.UI_WATCHDOG_MODE || 'anonymous';
const runAnonymousPass = WATCHDOG_MODE === 'anonymous' || WATCHDOG_MODE === 'both';
const runAuthenticatedPass = WATCHDOG_MODE === 'authenticated' || WATCHDOG_MODE === 'both';
const startedAt = new Date().toISOString();
const startedAtMs = Date.now();
const runId = new Date(startedAt).toISOString().replace(/[:.]/g, '-');

const { chromium } = await import('playwright');
const { uiWatchdogRoutes } = await import(path.join(ROOT, 'src/lib/watchdog/routes.ts'));

await fs.mkdir(OUT_DIR, { recursive: true });
const runDir = path.join(OUT_DIR, runId);
await fs.mkdir(runDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const results = [];
let overall = 'pass';

for (const route of uiWatchdogRoutes) {
  const routeMode = route.authOptional && WATCHDOG_MODE === 'both' ? 'both' : WATCHDOG_MODE;
  const passes = [];

  if (!route.authOptional || runAnonymousPass) {
    passes.push({ mode: 'anonymous' });
  }
  if (route.authOptional && runAuthenticatedPass) {
    passes.push({ mode: 'authenticated' });
  }

  const passResults = [];

  for (const pass of passes) {
    const page = await context.newPage();
    page.setDefaultTimeout(TIMEOUT_MS);
    const consoleErrors = [];
    const pageErrors = [];
    const requestFailures = [];
    const httpFailures = [];
    const failOnConsolePatterns = route.failOnConsolePatterns || [];
    const ignoreConsolePatterns = route.ignoreConsolePatterns || [];
    const ignoreRequestFailures = route.ignoreRequestFailures || [];
    const ignoreHttpFailures = route.ignoreHttpFailures || [];
    const allowRedirectTo = route.allowRedirectTo || [];
    const expectedStatus = route.expectedStatus || [200];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('requestfailed', (req) =>
      requestFailures.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText || 'unknown' }),
    );
    page.on('response', (res) => {
      const status = res.status();
      if (status < 400) return;
      let method = 'GET';
      let resourceType = 'other';
      try {
        const req = res.request();
        method = req.method();
        resourceType = req.resourceType();
      } catch {}
      httpFailures.push({ url: res.url(), status, method, resourceType });
    });

    const url = new URL(route.path, BASE_URL).toString();
    let httpStatus = null;
    let title = null;
    let navPresent = false;
    let missingExpected = [];
    let missingExpectedSelectors = [];
    let missingExpectedTitle = [];
    let safeSelectorMatched = null;
    let safeSelectorSatisfied = !(route.safeSelectors?.length);
    let fatal = null;
    let finalPath = route.path;
    let redirectPath = null;
    let authSatisfied = true;
    let authObservedPath = null;

    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
      httpStatus = resp?.status() ?? null;
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      const finalUrl = new URL(page.url());
      finalPath = finalUrl.pathname;
      redirectPath = finalPath !== route.path ? finalPath : null;

      for (const selector of route.safeSelectors || []) {
        const matched = await page.locator(selector).first().isVisible().catch(() => false);
        if (matched) {
          safeSelectorMatched = selector;
          safeSelectorSatisfied = true;
          break;
        }
        const waited = await page.locator(selector).first().waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false);
        if (waited) {
          safeSelectorMatched = selector;
          safeSelectorSatisfied = true;
          break;
        }
      }

      title = await page.title();
      const bodyText = await page.locator('body').innerText().catch(() => '');
      navPresent = await page.locator('a,button,[role="navigation"]').count().then((n) => n > 0).catch(() => false);
      missingExpected = (route.expectedText || []).filter((s) => !bodyText.includes(s) && !(title || '').includes(s));
      missingExpectedTitle = (route.expectedTitle || []).filter((s) => !(title || '').includes(s));
      for (const selector of route.expectedSelectors || []) {
        const matched = await page.locator(selector).first().count().then((n) => n > 0).catch(() => false);
        if (!matched) missingExpectedSelectors.push(selector);
      }
    } catch (err) {
      fatal = String(err);
    }

    const redirectAllowed = !redirectPath || allowRedirectTo.includes(redirectPath);
    const statusAllowed = httpStatus === null || expectedStatus.includes(httpStatus);
    const navSatisfied = route.requireNav === undefined ? true : navPresent === route.requireNav;
    const authExpectedPaths = route.authExpectedPaths || ['/login'];
    authObservedPath = redirectPath ?? finalPath;
    if (route.authOptional) {
      if (pass.mode === 'authenticated') {
        authSatisfied = !authExpectedPaths.includes(authObservedPath);
      } else {
        authSatisfied = true;
        if (authExpectedPaths.includes(authObservedPath)) {
          missingExpected = [];
          missingExpectedSelectors = [];
          missingExpectedTitle = [];
          safeSelectorSatisfied = true;
        }
      }
    }

    const filteredConsoleErrors = consoleErrors.filter((message) => !ignoreConsolePatterns.some((pattern) => message.includes(pattern)));
    const matchingConsoleFailures = filteredConsoleErrors.filter((message) => failOnConsolePatterns.some((pattern) => message.includes(pattern)));
    const filteredRequestFailures = requestFailures.filter((failure) => {
      if (failure.failure === 'net::ERR_ABORTED' && failure.url.includes('/api/v2/stream/')) {
        return false;
      }
      return !ignoreRequestFailures.some((pattern) => failure.url.includes(pattern) || failure.failure.includes(pattern));
    });
    const filteredHttpFailures = httpFailures.filter((failure) => !ignoreHttpFailures.some((pattern) => failure.url.includes(pattern)));

    let classification = 'pass';
    if (fatal || pageErrors.length || missingExpected.length || missingExpectedSelectors.length || missingExpectedTitle.length || !redirectAllowed || !statusAllowed || !navSatisfied || !safeSelectorSatisfied) {
      classification = 'route_fail';
    } else if (!authSatisfied) {
      classification = 'auth_fail';
    } else if (filteredHttpFailures.length || filteredRequestFailures.length) {
      classification = route.authOptional ? 'auth_fail' : 'shared_dependency_fail';
    } else if (matchingConsoleFailures.length) {
      classification = 'warning_only';
    }

    const severity = classification === 'pass' ? 'pass' : classification === 'warning_only' ? 'warn' : 'fail';
    const status = severity === 'pass' ? 'pass' : 'fail';

    const screenshotFileName = `${route.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${passes.length > 1 ? `-${pass.mode}` : ''}.png`;
    const screenshotPath = path.join(runDir, screenshotFileName);
    const screenshotRelativePath = path.join(runId, screenshotFileName);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

    passResults.push({
      mode: pass.mode,
      name: route.name,
      path: route.path,
      url,
      status,
      severity,
      classification,
      httpStatus,
      title,
      navPresent,
      fatal,
      finalPath,
      redirectPath,
      redirectAllowed,
      expectedStatus,
      statusAllowed,
      safeSelectorMatched,
      safeSelectorSatisfied,
      missingExpectedSelectors,
      missingExpectedTitle,
      navSatisfied,
      watchdogMode: pass.mode,
      authSatisfied,
      authObservedPath,
      consoleErrorCount: filteredConsoleErrors.length,
      consoleErrors: filteredConsoleErrors,
      pageErrorCount: pageErrors.length,
      pageErrors,
      requestFailedCount: filteredRequestFailures.length,
      requestFailures: filteredRequestFailures,
      httpFailureCount: filteredHttpFailures.length,
      httpFailures: filteredHttpFailures,
      matchingConsoleFailureCount: matchingConsoleFailures.length,
      matchingConsoleFailures,
      missingExpected,
      screenshotPath: screenshotRelativePath,
    });
    await page.close();
  }

  const selectedResult =
    passResults.find((result) => result.severity === 'fail') ??
    passResults.find((result) => result.severity === 'warn') ??
    passResults[0];

  if (!selectedResult) continue;

  const result = {
    ...selectedResult,
    watchdogMode: routeMode,
    passResults: passResults,
  };

  if (result.status === 'fail') overall = 'fail';
  results.push(result);
}

const finishedAt = new Date().toISOString();
const durationMs = Date.now() - startedAtMs;

const rootCauseCounts = new Map();
const addRootCause = (key, label, severity) => {
  const existing = rootCauseCounts.get(key);
  if (existing) {
    existing.count += 1;
    if (existing.severity === 'warn' && severity === 'fail') existing.severity = 'fail';
    return;
  }
  rootCauseCounts.set(key, { key, label, count: 1, severity });
};

const hardFailReasons = [];
const warningReasons = [];
const normalizedHttpFailures = [];
const redirects = [];
const sharedDependencyFailures = [];
const authFailures = [];

for (const result of results) {
  const isFail = result.severity === 'fail';
  const targetReasons = isFail ? hardFailReasons : result.severity === 'warn' ? warningReasons : null;
  if (targetReasons && result.classification !== 'pass') targetReasons.push(`${result.path}:${result.classification}`);

  if (result.redirectPath) {
    redirects.push({ route: result.path, from: result.path, to: result.redirectPath, allowed: result.redirectAllowed });
    if (!result.redirectAllowed) addRootCause(`redirect:${result.redirectPath}`, `redirect mismatch → ${result.redirectPath}`, isFail ? 'fail' : 'warn');
  }

  if (result.classification === 'auth_fail') {
    authFailures.push({ route: result.path, observedPath: result.authObservedPath });
    addRootCause(`auth:${result.authObservedPath ?? 'unknown'}`, `auth redirect → ${result.authObservedPath ?? 'unknown'}`, isFail ? 'fail' : 'warn');
  }

  for (const failure of result.httpFailures) {
    normalizedHttpFailures.push({ route: result.path, status: failure.status, method: failure.method, url: failure.url });
    if (result.classification === 'shared_dependency_fail') {
      sharedDependencyFailures.push({ route: result.path, url: failure.url, status: failure.status, failure: null });
      addRootCause(`http:${failure.url}`, `${failure.status} ${failure.url}`, isFail ? 'fail' : 'warn');
    }
  }

  for (const failure of result.requestFailures) {
    if (result.classification === 'shared_dependency_fail') {
      sharedDependencyFailures.push({ route: result.path, url: failure.url, status: null, failure: failure.failure });
      addRootCause(`request:${failure.url}`, `${failure.failure} ${failure.url}`, isFail ? 'fail' : 'warn');
    }
  }

  if (result.missingExpected[0]) addRootCause(`missing-text:${result.missingExpected[0]}`, `missing text: ${result.missingExpected[0]}`, isFail ? 'fail' : 'warn');
  if (result.missingExpectedSelectors[0]) addRootCause(`missing-selector:${result.missingExpectedSelectors[0]}`, `missing selector: ${result.missingExpectedSelectors[0]}`, isFail ? 'fail' : 'warn');
  if (result.missingExpectedTitle[0]) addRootCause(`missing-title:${result.missingExpectedTitle[0]}`, `missing title: ${result.missingExpectedTitle[0]}`, isFail ? 'fail' : 'warn');
  if (result.pageErrors[0]) addRootCause(`pageerror:${result.pageErrors[0]}`, result.pageErrors[0], isFail ? 'fail' : 'warn');
  if (result.fatal) addRootCause(`fatal:${result.fatal}`, result.fatal, 'fail');
}

const summary = {
  runId,
  startedAt,
  finishedAt,
  durationMs,
  watchdogMode: WATCHDOG_MODE,
  baseUrl: BASE_URL,
  overall,
  routeCount: results.length,
  failureCount: results.filter((r) => r.severity === 'fail').length,
  warningCount: results.filter((r) => r.severity === 'warn').length,
  rootCauseRollup: Array.from(rootCauseCounts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  normalizedDiagnostics: {
    hardFailReasons,
    warningReasons,
    httpFailures: normalizedHttpFailures,
    redirects,
    sharedDependencyFailures,
    authFailures,
  },
  results,
};

await fs.writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
await fs.writeFile(path.join(OUT_DIR, 'latest.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
