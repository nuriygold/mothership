// TEMPORARY STUB — Prisma → Drizzle migration in progress.
//
// Prisma is being removed in favour of Drizzle (see lib/db/*). This module is
// intentionally a lazy-throwing proxy so that:
//
//   1. `import { prisma } from '@/lib/prisma'` continues to typecheck and
//      resolve in the ~30 files that still reference it during the migration.
//   2. `next build` page-data collection does not fail with
//      "Cannot find module '.prisma/client/default'" on Vercel, where
//      `npm install --ignore-scripts` skips the @prisma/client postinstall
//      that would normally run `prisma generate`.
//   3. Any code path that actually invokes a Prisma query at runtime throws
//      a clear, labelled error so we can finish migrating it to Drizzle.
//
// We intentionally do NOT import `@prisma/client` here — that import alone
// triggers the .prisma/client/default resolution failure during build.
//
// See docs/drizzle-rail-migration.md for the migration plan and ownership.

function notMigrated(path: string): never {
  throw new Error(
    `[prisma-stub] prisma.${path} was invoked, but Prisma has been removed. ` +
      `Port this code path to Drizzle (lib/db/*) before re-enabling. ` +
      `See docs/drizzle-rail-migration.md.`,
  );
}

function makeProxy(path: string): any {
  // Use a function as the proxy target so `apply` traps work for callable
  // accessors like `prisma.$transaction(...)` or `prisma.user.findMany(...)`.
  const target = function () {
    /* noop */
  };
  return new Proxy(target, {
    get(_t, prop) {
      // Avoid hijacking thenable-detection: if anyone awaits `prisma` itself
      // we want it to resolve to the proxy, not to invoke a non-existent
      // `.then`. Returning undefined for `then` makes Promise.resolve see a
      // plain (non-thenable) value.
      if (prop === 'then') return undefined;
      if (typeof prop === 'symbol') return undefined;
      return makeProxy(`${path}.${String(prop)}`);
    },
    apply() {
      notMigrated(path);
    },
  });
}

export const prisma: any = makeProxy('prisma');
