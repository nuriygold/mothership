import assert from 'node:assert/strict';

async function run() {
  const module = await import('../../../../api/v2/tasks/index.ts');

  assert.equal(typeof module.GET, 'function');

  const response = await module.GET();
  assert.ok(response instanceof Response);
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.equal(typeof body, 'object');
  assert.ok(body !== null);
  assert.ok('counters' in body);
  assert.ok('active' in body);
  assert.ok('today' in body);
  assert.ok('backlog' in body);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
