# May 2026 Makeover

This document captures what is being repaired in the current implementation pass, what has already been applied, how to verify it, and what remains after the current slice.

## Overview

The May 2026 makeover is focused on moving the active app and API server out of a mixed migration state.

The immediate goals are to:

- remove stale generated and backup-only artifacts from the active runtime path
- restore missing backend surfaces that the UI expects to call
- fix broken TypeScript and build wiring that still referenced missing dist outputs or stale externals
- define the remaining phases needed to finish the migration cleanly

## Applied in Phase 1

Phase 1 is already applied.

- Removed the stale generated workflow bundle under `app/.well-known/workflow/v1/*`
- Fixed mothership TypeScript aliasing in `artifacts/mothership/tsconfig.json`
- Fixed mothership package wiring in `artifacts/mothership/package.json`
- Removed the stale Prisma external from `artifacts/api-server/build.mjs`
- Updated the root V2 task handlers so they import source files instead of missing built artifacts in:
  - `api/v2/tasks/index.ts`
  - `api/v2/tasks/[taskId].ts`

## Applied in Phase 2

Phase 2 is already applied.

- Added a new Express dispatch router in `artifacts/api-server/src/routes/dispatch.ts`
- Mounted that router in `artifacts/api-server/src/routes/index.ts`
- Restored the missing ops live feed endpoint in `artifacts/api-server/src/routes/ops.ts`

This means the dispatch surface now exists in the active API server instead of only in `.migration-backup`, so the Dispatch page should have real backend targets again.

## Current State

The repair slice is in better shape, but not fully finished.

What should now be true:

- the stale workflow debris under `app/.well-known/workflow/v1` is gone
- the API server should no longer depend on missing built dist artifacts for the repaired task and dispatch surfaces
- the Dispatch page should no longer rely on backup-only routes for its main API targets

What is still true:

- remaining typecheck failures are mostly pre-existing mothership issues outside this repair slice
- the biggest known leftovers are around `imapflow` typing and the `V2CashFlowForecast` mismatch

## Verification Checklist

### 1. Confirm stale workflow debris is gone

```bash
find app/.well-known/workflow/v1 -type f
```

Expected result: no output.

### 2. Verify the API server no longer depends on missing built artifacts

```bash
pnpm --filter @workspace/api-server run typecheck
```

Expected result: no failures from missing dist imports or rootDir layout. Any remaining failures should be unrelated source issues elsewhere in mothership.

### 3. Smoke test dispatch routes against the local API server

```bash
curl http://localhost:PORT/api/dispatch/campaigns
curl http://localhost:PORT/api/dispatch/output-folders
curl http://localhost:PORT/api/ops/campaigns/<campaignId>/feed
```

Create a campaign:

```bash
curl -X POST http://localhost:PORT/api/dispatch/campaigns \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test Campaign","objective":"Verify dispatch router"}'
```

Then test:

- `GET /api/dispatch/campaigns/:id`
- `POST /api/dispatch/campaigns/:id/plan`
- `POST /api/dispatch/campaigns/:id/plan/approve`
- `POST /api/dispatch/campaigns/:id/run`
- `GET /api/dispatch/campaigns/:id/progress`
- `POST /api/dispatch/campaigns/:id/tasks`
- `POST /api/dispatch/campaigns/:id/tasks/:taskId/retry`
- `POST /api/dispatch/campaigns/:id/tasks/:taskId/review`
- `POST /api/dispatch/campaigns/:id/tasks/:taskId/replan`

### 4. Check the V2 task surface still works without dist imports

```bash
curl http://localhost:PORT/api/v2/tasks
curl -X POST http://localhost:PORT/api/v2/tasks \
  -H 'Content-Type: application/json' \
  -H 'x-mothership-v2-key: <if configured>' \
  -d '{"title":"Test task"}'
```

Also verify `PATCH /api/v2/tasks/:id` still works for the supported actions.

### 5. UI-level check

Open the Dispatch page and confirm these no longer 404:

- `/api/dispatch/campaigns`
- `/api/dispatch/output-folders`
- `/api/ops/campaigns/:id/feed`

## Remaining Phases

### Phase 3 — Database cleanup and env completion

- retire the legacy `lib/db` package from the active build graph
- resolve the `wellness_logs` dual-authority issue between Drizzle and the Supabase SQL migration
- fill out the missing runtime variables in `.env.example`
- make `OPENCLAW_STREAMS_PATH` configurable instead of hardcoded

### Phase 4 — Workflow system decision

Make a binary decision on the workflow stack:

- either restore the workflow implementation from `.migration-backup` and wire it back into the live app
- or remove the workflow shims and stale workflow aliases entirely

The current mixed state should not remain.

### Phase 5 — Runtime activation

- add real scheduler and worker activation for dispatch processing so queued and scheduled campaigns are processed automatically
- convert the current demo-style agent records into first-class agent objects with real model, instruction, tool, and memory configuration
