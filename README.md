# Mothership

Agentic Operations Platform for Nuriy

## Current Status

Mothership is now running a dual-layer architecture:

- **V1** endpoints and flows remain available for backward compatibility.
- **V2** is live under `/api/v2/*` with bot-centric orchestration, SSE streams, and action-first UI behavior.

Primary UI routes:

- `/today`
- `/tasks`
- `/bots`
- `/email`
- `/finance`
- `/activity`

## Tech Stack

- **Frontend:** Next.js 14, React, TypeScript, SWR/TanStack Query
- **Backend:** Next.js API routes + Prisma + PostgreSQL (Supabase)
- **Task source:** GitHub task-pool (`nuriygold/task-pool`)
- **Orchestration:** OpenClaw gateway + named agents
- **Comms:** Telegram + in-app command center
- **Voice:** Azure Speech STT/TTS
- **Realtime:** SSE-first with polling fallback

## V2 API Surface

### Core feeds

- `GET /api/v2/dashboard/today`
- `GET /api/v2/tasks`
- `GET /api/v2/bots`
- `GET /api/v2/email`
- `GET /api/v2/email/:id/ai-drafts`
- `GET /api/v2/finance/overview`
- `GET /api/v2/activity/log`

### Mutations

- `POST /api/v2/actions/:id/approve` (idempotent approval handling)
- `PATCH /api/v2/tasks/:id` (action-based task mutation: `start|defer|complete|unblock`)

### SSE streams

- `GET /api/v2/stream/dashboard`
- `GET /api/v2/stream/bots`
- `GET /api/v2/stream/kissin-booth`
- `GET /api/v2/stream/email/:id/drafts`

## Bot Routing

Mothership routes work by domain intent:

- **Finance** -> Adrian
- **Comms / Email** -> Ruby
- **Research / Synthesis** -> Emerald
- **Document intelligence** -> Adobe Pettaway
- **System orchestration / fallback** -> Gateway/default agent

## Email Drafting (Hybrid V2)

`/api/v2/email/:id/ai-drafts` returns:

1. Two immediate deterministic template drafts.
2. A third **Ruby Custom** draft asynchronously via SSE (`/api/v2/stream/email/:id/drafts`).

If Ruby generation fails, template actions still work.

## Deployment & Operations

- **Secrets location:** host-managed secrets only (Vercel), never committed.
- **Database:** set `DATABASE_URL` (Supabase service role URL with SSL).
- **Task source:** set `MOTHERSHIP_TASK_SOURCE=task_pool_repo`.
  - Optional: `TASK_POOL_REPO_OWNER`, `TASK_POOL_REPO_NAME`, `TASK_POOL_REPO_BRANCH`, `TASK_POOL_SNAPSHOT_PATH`
  - Private repo support: `GITHUB_TOKEN`
- **Migrations (prod):** `npm run migrate:deploy`
- **Seeding:** never in production; staging-only with `npm run db:seed:staging`
- **Primary health checks:** `/today`, `/api/openclaw/health`, `/api/v2/dashboard/today`

## Environment Variables

### OpenClaw

- `OPENCLAW_GATEWAY`
- `OPENCLAW_TOKEN`
- `OPENCLAW_DEFAULT_AGENT`
- `OPENCLAW_AGENT_RUBY`
- `OPENCLAW_AGENT_EMERALD`
- optional mappings (recommended): `OPENCLAW_AGENT_ADRIAN`, `OPENCLAW_AGENT_ADOBE`
- optional model override: `OPENCLAW_MODEL`

### Email

- `EMAIL_PROVIDER` (`gmail` or `zoho`)
- `EMAIL_INBOXES`
- Gmail: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- Zoho: `ZOHO_IMAP_USERNAME`, `ZOHO_IMAP_PASSWORD`

### Voice (Azure)

- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION` (example: `eastus2`)
- optional `AZURE_SPEECH_VOICE` (default: `en-US-AriaNeural`)

### V2 API Guard (optional but recommended)

- `MOTHERSHIP_V2_API_KEY`
  - When set, `/api/v2/*` expects header: `x-mothership-v2-key`
  - Unauthorized responses use a consistent JSON error envelope

## Local Development

```bash
npm install
npm run dev
```

Then open [http://localhost:3000/today](http://localhost:3000/today).

## V2 Validation Scripts

```bash
# Contracts
npm run test:v2:contracts

# Idempotency + auth envelope checks
npm run test:v2:idempotency

# SSE concurrency smoke
npm run test:v2:sse
```

Use `BASE_URL` to target deployed environments, for example:

```bash
BASE_URL=https://mothership-blush.vercel.app npm run test:v2:contracts
```

## Notes

- V1 routes remain in place by design.
- Legacy file `services/workflowService.ts` was removed because it is incompatible with current Prisma schema and breaks builds.
- See `LAUNCH_CHECKLIST.md` for launch/runbook details.

---

Maintainer: Emerald Larkspur
