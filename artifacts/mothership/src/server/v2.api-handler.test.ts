import assert from 'node:assert/strict';
import { getV2TasksFeed } from './v2.js';

async function run() {
  const body = await getV2TasksFeed();
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
