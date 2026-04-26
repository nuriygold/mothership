// TEMPORARY STUB — Prisma → Drizzle migration in progress.
// The original handler aggregated health checks for gateway/ruby/telegram/
// github/zoho/gmail and called prisma.task.count() to verify Ruby DB.
// Will be re-enabled once Ruby's Task table is fully on Drizzle.
// See docs/drizzle-rail-migration.md.
import { migrationStub } from '@/lib/migration-stub';

export const dynamic = 'force-dynamic';

export const GET = migrationStub;
export const POST = migrationStub;
export const PATCH = migrationStub;
export const PUT = migrationStub;
export const DELETE = migrationStub;
