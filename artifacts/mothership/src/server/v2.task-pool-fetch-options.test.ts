import assert from 'node:assert/strict';

async function run() {
  const originalSource = process.env.MOTHERSHIP_TASK_SOURCE;
  const originalFetch = globalThis.fetch;

  try {
    process.env.MOTHERSHIP_TASK_SOURCE = 'task_pool_repo';

    let capturedInit: RequestInit | undefined;
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      capturedInit = init;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const { listTasks } = await import('../lib/services/tasks.ts');
    await listTasks();

    assert.ok(capturedInit, 'expected fetch to be called');
    assert.ok(!('next' in (capturedInit as Record<string, unknown>)), 'fetch init should not include Next.js-only options');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSource === undefined) {
      delete process.env.MOTHERSHIP_TASK_SOURCE;
    } else {
      process.env.MOTHERSHIP_TASK_SOURCE = originalSource;
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
