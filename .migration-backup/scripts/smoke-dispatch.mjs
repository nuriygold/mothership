#!/usr/bin/env node
/**
 * Dispatch page smoke test.
 *
 * Tests every route the Dispatch page uses, without triggering real
 * OpenClaw inference calls.
 *
 * Usage:
 *   node scripts/smoke-dispatch.mjs
 *   BASE_URL=https://mothership-blush.vercel.app node scripts/smoke-dispatch.mjs
 */

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

let passed = 0;
let failed = 0;

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, json, text };
}

function ok(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

async function section(title, fn) {
  console.log(`\n${title}`);
  try {
    await fn();
  } catch (err) {
    console.error(`  ✗ Uncaught: ${err.message}`);
    failed++;
  }
}

// ── 1. Gateway health ────────────────────────────────────────────────────────
await section('1. OpenClaw gateway health', async () => {
  const { status, json } = await req('GET', '/api/openclaw/health');
  ok('responds 200 or 503', status === 200 || status === 503, `got ${status}`);
  ok('returns ok field', json !== null && typeof json.ok === 'boolean', JSON.stringify(json));
  ok('returns reason string', typeof json?.reason === 'string', JSON.stringify(json));
});

// ── 2. Campaign list ─────────────────────────────────────────────────────────
await section('2. GET /api/dispatch/campaigns', async () => {
  const { status, json } = await req('GET', '/api/dispatch/campaigns');
  ok('responds 200', status === 200, `got ${status}`);
  ok('returns array', Array.isArray(json), JSON.stringify(json)?.slice(0, 120));
});

// ── 3. Create campaign ───────────────────────────────────────────────────────
let campaignId;
await section('3. POST /api/dispatch/campaigns', async () => {
  const { status, json } = await req('POST', '/api/dispatch/campaigns', {
    title: '[smoke] dispatch test campaign',
    description: 'Created by smoke-dispatch.mjs — safe to delete',
  });
  ok('responds 201', status === 201, `got ${status}`);
  ok('returns id', typeof json?.id === 'string', JSON.stringify(json));
  ok('status is DRAFT', json?.status === 'DRAFT', `got ${json?.status}`);
  campaignId = json?.id;
});

if (!campaignId) {
  console.error('\nAbort: could not create campaign — skipping dependent checks.');
  process.exit(1);
}

// ── 4. Campaign detail ───────────────────────────────────────────────────────
await section(`4. GET /api/dispatch/campaigns/${campaignId}`, async () => {
  const { status, json } = await req('GET', `/api/dispatch/campaigns/${campaignId}`);
  ok('responds 200', status === 200, `got ${status}`);
  ok('id matches', json?.id === campaignId);
  ok('tasks is array', Array.isArray(json?.tasks));
});

// ── 5. Add manual task ───────────────────────────────────────────────────────
let taskId;
await section(`5. POST /api/dispatch/campaigns/${campaignId}/tasks`, async () => {
  const { status, json } = await req('POST', `/api/dispatch/campaigns/${campaignId}/tasks`, {
    title: '[smoke] manual task',
    description: 'Smoke test task',
    priority: 3,
  });
  ok('responds 201', status === 201, `got ${status}`);
  ok('returns task id', typeof json?.id === 'string', JSON.stringify(json));
  ok('status is PLANNED', json?.status === 'PLANNED', `got ${json?.status}`);
  taskId = json?.id;
});

// ── 6. Campaign progress ─────────────────────────────────────────────────────
await section(`6. POST /api/dispatch/campaigns/${campaignId}/progress`, async () => {
  const { status, json } = await req('POST', `/api/dispatch/campaigns/${campaignId}/progress`);
  ok('responds 200', status === 200, `got ${status}`);
  ok('has total field', typeof json?.total === 'number', JSON.stringify(json));
  ok('counts by status', typeof json?.byStatus === 'object', JSON.stringify(json));
});

// ── 7. Bot recommendation ────────────────────────────────────────────────────
await section(`7. POST /api/dispatch/campaigns/${campaignId}/recommend`, async () => {
  const { status, json } = await req('POST', `/api/dispatch/campaigns/${campaignId}/recommend`);
  ok('responds 200', status === 200, `got ${status}`);
  ok('returns botKey', typeof json?.botKey === 'string', JSON.stringify(json));
});

// ── 8. 404 for unknown campaign ──────────────────────────────────────────────
await section('8. GET /api/dispatch/campaigns/nonexistent', async () => {
  const { status } = await req('GET', '/api/dispatch/campaigns/nonexistent-id-smoke');
  ok('responds 404', status === 404, `got ${status}`);
});

// ── 9. OpenClaw dispatch validation (no text) ────────────────────────────────
await section('9. POST /api/openclaw/dispatch — missing text', async () => {
  const { status, json } = await req('POST', '/api/openclaw/dispatch', {});
  ok('responds 400', status === 400, `got ${status}`);
  ok('ok is false', json?.ok === false, JSON.stringify(json));
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Passed: ${passed}  Failed: ${failed}`);
if (failed > 0) process.exit(1);
