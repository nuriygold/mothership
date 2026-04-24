## Prisma to Drizzle Rail Migration

This repo is being migrated in staged rails rather than a single ORM flip.

### Rail 1: Schema types detached from Prisma

Completed in this step:

- Prisma-generated enums are mirrored in [lib/db/enums.ts](/Users/claw/mothership/lib/db/enums.ts)
- Shared JSON input/output types are mirrored in [lib/db/json.ts](/Users/claw/mothership/lib/db/json.ts)
- Routes and services import schema enums and JSON types from local modules instead of `@prisma/client`

Result:

- Prisma is no longer the source of truth for application-level enums and JSON helper types
- The remaining Prisma dependency is concentrated around the query adapter and a small set of Prisma client entry points

### Next rail

- Add Drizzle schema files under `lib/db/`
- Introduce a Drizzle-backed query adapter beside the existing Prisma adapter
- Migrate service modules one slice at a time from `lib/prisma.ts` to the new adapter
- Remove Prisma scripts and generated client only after the runtime query path is fully off Prisma
