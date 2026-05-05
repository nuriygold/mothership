# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Artifacts

- **mothership** (`artifacts/mothership`, `/`): Vite + React 19 port of an imported Next.js app
  ("Mothership / Iceman Edition"). Pages are auto-routed from `src/app/**/page.tsx` via wouter +
  `import.meta.glob`. Server-only Next.js, Drizzle, Postgres, Supabase, Workflow SDK, Plaid, etc.
  imports are aliased to no-op shims under `src/shims/` (see `vite.config.ts`). The original
  `app/api/**` route handlers were stripped — backend functionality is out of scope; pages render
  with full Tailwind v4 styling and any data fetches simply fail with 502/undefined.
  - **Durable Ops Engine** (`src/lib/ops/engine/`): Postgres-backed agent execution engine
    consumed by `/ops` UI. Lives in mothership and is exported as `@workspace/mothership/ops-engine`
    so the api-server can import it across the workspace boundary. Drives campaigns through a
    deterministic step plan; every state change appends a durable event so the UI feed projects
    from real history. Uses Supabase via `DATABASE_URL_POOLER_SESSION` (the regional Supavisor
    pooler — direct `db.<ref>.supabase.co` is IPv6-only and unreachable from Replit). Schema is
    `mc*` tables in `src/lib/db/dispatch-schema.ts`; push with
    `pnpm --filter @workspace/mothership run db:push`. Browser bundle is protected by Vite shims
    that alias `drizzle-orm`/`postgres`/`pg` to no-ops.
- **api-server** (`artifacts/api-server`): Express API server. Mounts `/api/ops/*` routes that
  delegate to the Durable Ops Engine; calls `bootstrap()` on listen so any `running`/`queued`
  campaigns are rehydrated after a process restart.
- **mockup-sandbox** (`artifacts/mockup-sandbox`): canvas component preview server.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
