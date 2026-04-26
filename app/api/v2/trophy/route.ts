// TEMPORARY STUB — Prisma → Drizzle migration in progress.
// Original handler aggregated weekly trophies from Task / Command /
// AuditEvent (DispatchCampaign + WellnessAnchor) — all of which still
// query through Prisma. Re-enabled once those tables are on Drizzle.
// See docs/drizzle-rail-migration.md.
import { migrationStub } from '@/lib/migration-stub';

export const dynamic = 'force-dynamic';

export const GET = migrationStub;
export const POST = migrationStub;
export const PATCH = migrationStub;
export const PUT = migrationStub;
export const DELETE = migrationStub;
