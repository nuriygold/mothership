#!/usr/bin/env node

const base = process.env.BASE_URL || 'http://localhost:3000';
const concurrency = Number(process.env.SSE_CLIENTS || '10');
const durationMs = Number(process.env.SSE_DURATION_MS || '6000');

async function openStream(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), durationMs);
  try {
    const res = await fetch(`${base}${path}`, { signal: controller.signal });
    if (!res.ok || !res.body) {
      throw new Error(`${path} failed with status ${res.status}`);
    }
    const reader = res.body.getReader();
    const first = await reader.read();
    if (first.done) throw new Error(`${path} closed before first chunk`);
    return true;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

async function main() {
  const targets = Array.from({ length: concurrency }).map((_, idx) =>
    openStream(idx % 2 === 0 ? '/api/v2/stream/dashboard' : '/api/v2/stream/bots')
  );
  await Promise.all(targets);
  console.log(`ok opened ${concurrency} concurrent streams`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
