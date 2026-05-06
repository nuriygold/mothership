import assert from 'node:assert/strict';
import { ensureV2Authorized } from '../lib/v2/auth.ts';

async function run() {
  const originalKey = process.env.MOTHERSHIP_V2_API_KEY;

  try {
    delete process.env.MOTHERSHIP_V2_API_KEY;
    assert.equal(ensureV2Authorized(new Request('https://example.com/api/v2/tasks')), null);

    process.env.MOTHERSHIP_V2_API_KEY = 'secret';

    const unauthorized = ensureV2Authorized(new Request('https://example.com/api/v2/tasks'));
    assert.ok(unauthorized instanceof Response);
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid API key.',
      },
    });

    const authorized = ensureV2Authorized(
      new Request('https://example.com/api/v2/tasks', {
        headers: { 'x-mothership-v2-key': 'secret' },
      }),
    );
    assert.equal(authorized, null);
  } finally {
    if (originalKey === undefined) {
      delete process.env.MOTHERSHIP_V2_API_KEY;
    } else {
      process.env.MOTHERSHIP_V2_API_KEY = originalKey;
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
