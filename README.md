# Mothership

Personalized Operations Hub for Nuriy

---

## Overview

Mothership is a next-generation personalized operations hub designed to centralize executive schedules, task management, accomplishments, and next steps in one dashboard.

## Technology Stack

- Frontend: Next.js + React + TypeScript, premium dashboard UI components
- Backend: PostgreSQL for persistent structured data
- Task Source: GitHub Issues/Projects integration for structured task syncing
- Orchestration: OpenClaw as command/control proxy and orchestration layer
- Communication: Telegram as primary command and notification surface
- Authentication: Lightweight for v1, no paid subscriptions

## Architecture Goals

- Modular design to allow clean extension with Boomerang-style workflows for intake, validation, approvals, transformations
- Scalable, maintainable codebase optimized for executive productivity

## Deployment & Operations (Supabase)

- **Env secrets**: set `DATABASE_URL` (service role) in your host secrets (e.g., Vercel) using the format in `env/.env.production.example`. Never commit real credentials.
- **Task source**: Mothership now reads tasks/workflows from `nuriygold/task-pool` by default via `MOTHERSHIP_TASK_SOURCE=task_pool_repo`.
  - Optional overrides: `TASK_POOL_REPO_OWNER`, `TASK_POOL_REPO_NAME`, `TASK_POOL_REPO_BRANCH`, `TASK_POOL_SNAPSHOT_PATH`.
  - If the task-pool repo is private, set `GITHUB_TOKEN` (server-side only) so API calls can read it.
- **Migrations (prod)**: run `npm run migrate:deploy`. Use `prisma migrate reset` only locally.
- **Seeding**: production should not be seeded. For staging-only, `npm run db:seed:staging` (same as local seed) — do not run in prod.
- **Health check**: start the app (`npm run dev` locally) and hit `/dashboard`; prod should boot cleanly even with empty data.
- **MCP vs Supabase**: Supabase DB setup is independent of any MCP server; MCP entries will not appear automatically.

See `LAUNCH_CHECKLIST.md` for a step-by-step launch runbook (secrets, deploy, smoke tests, rollback notes).

## Next Steps

- Scaffold Next.js + React + TypeScript project boilerplate
- Set up PostgreSQL schema for tasks, accomplishments, user schedules
- Integrate GitHub Issues API for task sync
- Embed Telegram command/notification interfaces
- Design premium dashboard UI mocks

---

Maintainer: Emerald Larkspur
