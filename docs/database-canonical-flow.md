# Database Canonical Flow

## Canonical authority

- Runtime schema: `artifacts/mothership/src/lib/db/schema.ts`
- Runtime client: `artifacts/mothership/src/lib/db/client.ts`
- Drizzle config: `artifacts/mothership/drizzle.config.ts`
- Drift check: `scripts/check_schema_drift.cjs`
- Root commands: `pnpm db:push`, `pnpm db:drift`

## Legacy paths

These must not be treated as schema authority:

- `lib/db/*`
- `.migration-backup/*`
- ad hoc SQL in old backup folders

## Rule of operation

1. Add or modify tables in `artifacts/mothership/src/lib/db/schema.ts`.
2. Push using the Mothership Drizzle config only.
3. Run drift checks from the repo root.
4. Do not introduce a second runtime schema package.

## Transitional note

`supabase/migrations/*` currently exists for direct SQL-managed pieces. During transition, avoid defining the same table in both Supabase SQL and a second independent schema source.