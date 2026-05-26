# API Server DB Authority

This package must not treat `@workspace/db` as the canonical schema source for Mothership.

Use the active Mothership DB authority instead:

- schema: `artifacts/mothership/src/lib/db/schema.ts`
- config: `artifacts/mothership/drizzle.config.ts`
- drift check: `scripts/check_schema_drift.cjs`

Schema authority is split by system boundary:

- app/runtime tables: `artifacts/mothership/src/lib/db/schema.ts`
- mission-control canonical tables: `artifacts/mothership/src/lib/db/dispatch-schema.ts`
- historical Supabase SQL files under `supabase/migrations/` are migration history, not the source of truth once reconciled to Drizzle

Future schema changes should be made in the Drizzle schema first and propagated through the active Mothership DB toolchain.

If this package needs shared DB access in the future, it should consume a dedicated canonical runtime package or move DB operations behind the Mothership server boundary.
## Supabase Migration Files

Historical DDL only. All tables confirmed present in the live database as of
the May 2026 schema audit (51 tables, both schema sets applied). Migration files
in `supabase/migrations/` are retained for history and must not be re-run.
`wellness_logs` specifically is now managed exclusively by Drizzle ORM via
`artifacts/mothership/src/lib/db/schema.ts`.
