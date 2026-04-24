/**
 * Temporary compatibility module during Prisma -> Drizzle migration.
 * Prefer importing `db` from `@/lib/db/client` in new code.
 */

export { db as prisma } from '@/lib/db/client';
