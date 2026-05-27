import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.MOTHERSHIP_BASE_URL || 'http://127.0.0.1:4173';
const ROOT = '/Users/claw/mothership/artifacts/mothership';
const OUT_DIR = path.join(ROOT, 'runtime/ui-watchdog');
const TIMEOUT_MS = Number(process.env.UI_WATCHDOG_TIMEOUT_MS || 15000);
const runId = new Date().toISOString().replace(/[:.]/g, '-');

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
  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('requestfailed', (req) => requestFailures.push({ url: req.url(), method: req.method(), failure: req.failure()?.errorText || 'unknown' }));

  const url = new URL(route.path, BASE_URL).toString();
  let httpStatus = null;
  let title = null;
  let navPresent = false;
  let missingExpected = [];
  let fatal = null;
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    httpStatus = resp?.status() ?? null;
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    title = await page.title();
    const bodyText = await page.locator('body').innerText().catch(() => '');
    navPresent = await page.locator('a,button,[role="navigation"]').count().then((n) => n > 0).catch(() => false);
    missingExpected = (route.expectedText || []).filter((s) => !bodyText.includes(s) && !(title || '').includes(s));
  } catch (err) {
    fatal = String(err);
  }

  const screenshotPath = path.join(runDir, `${route.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  const status = fatal || consoleErrors.length || pageErrors.length || requestFailures.length || missingExpected.length ? 'fail' : 'pass';
  if (status === 'fail') overall = 'fail';
  results.push({
    name: route.name,
    path: route.path,
    url,
    status,
    httpStatus,
    title,
    navPresent,
    fatal,
    consoleErrorCount: consoleErrors.length,
    consoleErrors,
    pageErrorCount: pageErrors.length,
    pageErrors,
    requestFailedCount: requestFailures.length,
    requestFailures,
    missingExpected,
    screenshotPath,
  });
  await page.close();
}

const summary = {
  runId,
  startedAt: new Date().toISOString(),
  baseUrl: BASE_URL,
  overall,
  routeCount: results.length,
  failureCount: results.filter((r) => r.status === 'fail').length,
  results,
};

await fs.writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2));
await fs.writeFile(path.join(OUT_DIR, 'latest.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
