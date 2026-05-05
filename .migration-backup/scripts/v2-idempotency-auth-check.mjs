#!/usr/bin/env node

const base = process.env.BASE_URL || 'http://localhost:3000';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const dashboardRes = await fetch(`${base}/api/v2/dashboard/today`);
  const dashboard = await dashboardRes.json();
  if (!dashboard.topPriorities?.[0]?.actionWebhook) {
    console.log('skip idempotency check (no priorities available)');
    return;
  }

  const webhook = dashboard.topPriorities[0].actionWebhook;
  const first = await fetch(`${base}${webhook}`, { method: 'POST' });
  const firstJson = await first.json();
  const second = await fetch(`${base}${webhook}`, { method: 'POST' });
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
