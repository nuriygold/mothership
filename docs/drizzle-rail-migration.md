## Drizzle Migration Notes

This repo now uses Drizzle for its runtime data access. These notes capture the migration path and the deploy rules that keep it stable.

### Rail 1: Schema types detached from the legacy client

Completed in this step:

- Schema enums are mirrored in [lib/db/enums.ts](/Users/aaliyathewarrior/mothership/mothership/lib/db/enums.ts)
- Shared JSON input/output types are mirrored in [lib/db/json.ts](/Users/aaliyathewarrior/mothership/mothership/lib/db/json.ts)
- Routes and services import schema enums and JSON types from local modules

Result:

- Schema enums and JSON helper types now live in local modules
- Runtime data access has been moved onto the Drizzle query layer

### Migration follow-up

- Add Drizzle schema files under `lib/db/`
- Keep service modules on the shared Drizzle adapter
- Remove any leftover migration scaffolding once it is no longer referenced

### Deploy Safety: Always Apply Drizzle Migrations

Vercel will run `npm run vercel-build` when the script exists. This repo uses that hook to
apply Drizzle migrations during deploy.

Behavior:

- Production deploys: runs `drizzle-kit migrate` then `next build`
- Preview deploys: skips migrations by default (set `RUN_MIGRATIONS_IN_PREVIEW=1` to enable)
- Set `SKIP_MIGRATIONS=1` to force-skip migration execution
