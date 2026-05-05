#!/usr/bin/env node

const base = process.env.BASE_URL || 'http://localhost:3000';

async function getJson(path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${path} returned non-json response (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(`${path} failed (${res.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const checks = [
  ['/api/v2/dashboard/today', (body) => assert(Array.isArray(body.timeline), 'today.timeline missing')],
  ['/api/v2/tasks', (body) => assert(body?.counters && Array.isArray(body.active), 'tasks shape invalid')],
  ['/api/v2/bots', (body) => assert(Array.isArray(body?.bots), 'bots shape invalid')],
  ['/api/v2/email', (body) => assert(Array.isArray(body?.inbox), 'email inbox missing')],
  ['/api/v2/finance/overview', (body) => assert(Array.isArray(body?.accounts), 'finance accounts missing')],
  ['/api/v2/activity/log', (body) => assert(Array.isArray(body?.events), 'activity events missing')],
];

async function main() {
  for (const [path, validate] of checks) {
    const body = await getJson(path);
    validate(body);
    console.log(`ok ${path}`);
  }

  const email = await getJson('/api/v2/email');
  if (email.inbox[0]?.id) {
    const drafts = await getJson(`/api/v2/email/${encodeURIComponent(email.inbox[0].id)}/ai-drafts`);
    assert(Array.isArray(drafts?.drafts), 'drafts missing array');
    assert(drafts.drafts.length >= 2, 'expected at least two template drafts');
    console.log('ok /api/v2/email/:id/ai-drafts');
  } else {
    console.log('skip email draft check (empty inbox)');
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
