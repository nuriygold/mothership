# @workspace/db (legacy)

This package is legacy and is **not** the schema authority for Mothership.

## Canonical database sources

- Schema: `artifacts/mothership/src/lib/db/schema.ts`
- Drizzle config: `artifacts/mothership/drizzle.config.ts`
- Drift check: `scripts/check_schema_drift.cjs`
- Push command: `pnpm db:push`

## Why this exists

This package was left behind during the Prisma -> Drizzle transition and now only
contains placeholder schema wiring. Keeping it as an active DB package causes
schema-authority drift and confusion.

## Rule

Do **not** add tables, migrations, or push commands here.
Use the Mothership DB paths above instead.