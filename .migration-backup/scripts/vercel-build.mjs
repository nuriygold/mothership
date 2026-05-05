import { execFileSync } from 'node:child_process';

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit', env: process.env });
}

const vercelEnv = process.env.VERCEL_ENV || '';
const skipMigrations = process.env.SKIP_MIGRATIONS === '1';
const runMigrationsInPreview = process.env.RUN_MIGRATIONS_IN_PREVIEW === '1';

// Vercel prefers `vercel-build` if present. We use it to keep the DB schema
// in sync with the app on deploys, using Drizzle (not Prisma).
const shouldMigrate =
  !skipMigrations && (vercelEnv === 'production' || runMigrationsInPreview);

console.log(
  JSON.stringify({
    service: 'vercel-build',
    vercelEnv,
    shouldMigrate,
    skipMigrations,
    runMigrationsInPreview,
  })
);

if (shouldMigrate) {
  console.log('[vercel-build] Running Drizzle migrations...');
  // Uses drizzle.config.ts by default.
  run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['drizzle-kit', 'migrate']);
} else {
  console.log('[vercel-build] Skipping migrations.');
}

console.log('[vercel-build] Running Next build...');
run(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'build']);

