// Shared 503 handler for routes that are temporarily disabled while their
// Prisma queries are being ported to Drizzle. See docs/drizzle-rail-migration.md.
//
// Once a route is fully migrated, replace the `migrationStub` exports with
// the real handlers.

import { NextResponse } from 'next/server';

export function migrationStub(_req?: Request, _ctx?: unknown) {
  return NextResponse.json(
    {
      error: 'migration_in_progress',
      message:
        'This endpoint is temporarily disabled while the Prisma → Drizzle ' +
        'migration completes. See docs/drizzle-rail-migration.md.',
    },
    { status: 503 },
  );
}
