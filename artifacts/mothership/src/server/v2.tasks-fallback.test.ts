import assert from 'node:assert/strict';

async function run() {
  const originalSource = process.env.MOTHERSHIP_TASK_SOURCE;
  const originalGithubToken = process.env.GITHUB_TOKEN;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings: string[] = [];

  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(' '));
  };

  try {
    process.env.MOTHERSHIP_TASK_SOURCE = 'task_pool_repo';
    delete process.env.GITHUB_TOKEN;
    delete process.env.DATABASE_URL;
    delete process.env.SUPABASE_DATABASE_URL;
    delete process.env.POSTGRES_URL_NON_POOLING;
    delete process.env.POSTGRES_URL;
    delete process.env.DATABASE_URL_POOLER_TRANS;
    delete process.env.DATABASE_URL_POOLER_SESSION;
    delete process.env.DATABASE_POOLER_URL;

    globalThis.fetch = async () => {
      throw new Error('network disabled for fallback test');
    };

    const { listTasks } = await import('../lib/services/tasks.ts');
    const tasks = await listTasks();

    assert.deepEqual(tasks, []);
    assert.ok(warnings.some((warning) => warning.includes('falling back to database tasks')));
    assert.ok(warnings.some((warning) => warning.includes('DB query failed')));
  } finally {
    console.warn = originalWarn;
    globalThis.fetch = originalFetch;
    if (originalSource === undefined) {
      delete process.env.MOTHERSHIP_TASK_SOURCE;
    } else {
      process.env.MOTHERSHIP_TASK_SOURCE = originalSource;
    }
    if (originalGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalGithubToken;
    }
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
