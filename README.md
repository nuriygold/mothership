# Mothership

Agentic Operations Platform for Nuriy

## Current Status

Mothership is now running a dual-layer architecture:

- **V1** endpoints and flows remain available for backward compatibility.
- **V2** is live under `/api/v2/*` with bot-centric orchestration, SSE streams, and action-first UI behavior.

Primary UI routes:

- `/` - Root/Home
- `/today` - Today's dashboard
- `/dashboard` - Main dashboard
- `/tasks` - Task management
- `/bots` - Bot orchestration
- `/email` - Email handling
- `/finance` - Financial overview
- `/activity` - Activity log
- `/command-center` - Command center
- `/dispatch` - Dispatch interface
- `/runs` - Execution runs
- `/workflows` - Workflow management
- `/vision` - Vision interface
- `/ruby` - Ruby agent interface
- `/marco` - Marco interface

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
- **Execution coordination / follow-through** -> Anchor
- **System orchestration / fallback** -> Gateway/default agent

## Email Drafting (Hybrid V2)

`/api/v2/email/:id/ai-drafts` returns:

1. Two immediate deterministic template drafts.
2. A third **Ruby Custom** draft asynchronously via SSE (`/api/v2/stream/email/:id/drafts`).

If Ruby generation fails, template actions still work.

## Deployment & Operations

- **Secrets location:** host-managed secrets only (Vercel), never committed.
- **Database:** set `DATABASE_URL` to your runtime database URL. For Supabase, prefer the pooler URL; if you keep `DATABASE_URL` on the direct host (`db.<project>.supabase.co:5432`), set `DATABASE_POOLER_URL` (or `SUPABASE_POOLER_URL`) so Prisma can automatically use the pooler at runtime.
- **Task source:** set `MOTHERSHIP_TASK_SOURCE=task_pool_repo`.
  - Optional: `TASK_POOL_REPO_OWNER`, `TASK_POOL_REPO_NAME`, `TASK_POOL_REPO_BRANCH`, `TASK_POOL_SNAPSHOT_PATH`
  - Private repo support: `GITHUB_TOKEN`
- **Migrations (prod):** run `npm run migrate:deploy` from CI/release job (recommended), or set `RUN_PRISMA_MIGRATE_DEPLOY=1` if you explicitly want Vercel build to run migrations.
- **Seeding:** never in production; staging-only with `npm run db:seed:staging`
- **Primary health checks:** `/today`, `/api/openclaw/health`, `/api/v2/dashboard/today`

## Environment Variables

### OpenClaw

- `OPENCLAW_GATEWAY`
- `OPENCLAW_TOKEN`
- `OPENCLAW_DEFAULT_AGENT`
- `OPENCLAW_AGENT_RUBY`
- `OPENCLAW_AGENT_EMERALD`
- optional mappings (recommended): `OPENCLAW_AGENT_ADRIAN`, `OPENCLAW_AGENT_ADOBE`, `OPENCLAW_AGENT_ANCHOR`
- optional model override: `OPENCLAW_MODEL`

### Email

- `EMAIL_PROVIDER` (`gmail` or `zoho`)
- `EMAIL_INBOXES`
- Gmail: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- Zoho IMAP (inbox sync): `ZOHO_IMAP_HOST`, `ZOHO_IMAP_PORT`, `ZOHO_IMAP_USERNAME`, `ZOHO_IMAP_PASSWORD`
- Zoho SMTP (send/reply): `ZOHO_SMTP_HOST`, `ZOHO_SMTP_PORT`, `ZOHO_SMTP_SECURE`, `ZOHO_EMAIL_USER`, `ZOHO_EMAIL_PASS`
  - Current defaults in code are `port 587` with STARTTLS (`secure: false`), and it auto-enables SSL when `ZOHO_SMTP_PORT=465`.

### Voice (Azure)

- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION` (example: `eastus2`)
- optional `AZURE_SPEECH_VOICE` (default: `en-US-AriaNeural`)


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
