#!/usr/bin/env node

const base = process.env.BASE_URL || 'http://localhost:3000';
const apiKey = process.env.MOTHERSHIP_V2_API_KEY || '';

function withKey() {
  return apiKey ? { 'x-mothership-v2-key': apiKey } : {};
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  if (apiKey) {
    const unauthorized = await fetch(`${base}/api/v2/tasks`);
    assert(unauthorized.status === 401, `expected 401 without key, got ${unauthorized.status}`);
    const payload = await unauthorized.json();
    assert(payload?.error?.code, 'missing error envelope for unauthorized response');
    console.log('ok auth envelope');
  } else {
    console.log('skip auth check (MOTHERSHIP_V2_API_KEY not set)');
  }

  const dashboardRes = await fetch(`${base}/api/v2/dashboard/today`, { headers: withKey() });
  const dashboard = await dashboardRes.json();
  if (!dashboard.topPriorities?.[0]?.actionWebhook) {
    console.log('skip idempotency check (no priorities available)');
    return;
  }

  const webhook = dashboard.topPriorities[0].actionWebhook;
  const first = await fetch(`${base}${webhook}`, { method: 'POST', headers: withKey() });
  const firstJson = await first.json();
  const second = await fetch(`${base}${webhook}`, { method: 'POST', headers: withKey() });
  const secondJson = await second.json();

  assert(first.status === 200 && second.status === 200, 'approve webhook did not return 200');
  assert(secondJson.idempotent === true, 'second approval call was not idempotent');
  console.log('ok idempotency');
  if (firstJson.idempotent === true) {
    console.log('note first call was already idempotent because action was pre-approved');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

