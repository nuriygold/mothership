# API Server DB Authority

This package must not treat `@workspace/db` as the canonical schema source for Mothership.

Use the active Mothership DB authority instead:

- schema: `artifacts/mothership/src/lib/db/schema.ts`
- config: `artifacts/mothership/drizzle.config.ts`
- drift check: `scripts/check_schema_drift.cjs`

If this package needs shared DB access in the future, it should consume a dedicated canonical runtime package or move DB operations behind the Mothership server boundary.