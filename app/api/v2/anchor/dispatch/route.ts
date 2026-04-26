// TEMPORARY STUB — Prisma → Drizzle migration in progress.
// Original handler streamed an Anchor/6 God OpenClaw response and persisted
// chat messages to ChatSession/ChatMessage. Re-enabled once those tables
// are on Drizzle. See docs/drizzle-rail-migration.md.
import { migrationStub } from '@/lib/migration-stub';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = migrationStub;
export const POST = migrationStub;
export const PATCH = migrationStub;
export const PUT = migrationStub;
export const DELETE = migrationStub;
