# Mothership

Personal agentic operations platform — tasks, bots, finance, email, and daily execution in one place.

## May 2026 Makeover

This repository is in the middle of a May 2026 implementation cleanup and migration repair.

For the current handover, applied phases, verification steps, and remaining work, see [docs/may-2026-makeover.md](docs/may-2026-makeover.md).

---

## Pages

| Route | Purpose |
|-------|---------|
| `/today` | Daily command center — timeline, wellness anchors, quick actions |
| `/tasks` | Kanban board with search, multi-select, and bulk actions |
| `/bots` | Live bot cards — chat with any agent, see current work |
| `/email` | Email triage with AI draft replies |
| `/finance` | Cash position, payables, plans, and health score |
| `/revenue-streams` | Revenue stream workspace — SOPs, quick actions, activity log per stream |
| `/activity` | System-wide event log with category filters and search |
| `/dispatch` | Campaign workspace — plan, launch, and track execution |
| `/ops` | Mission control — durable campaigns, agents, feed, blockers |
| `/projects` | High-level project buckets — Creative, Robotic, Fund Dev, Home |
| `/vision` | Vision board — pillars, linked tasks, goals |
| `/trophy` | Win history — completed tasks grouped by day, week-over-week |
| `/ruby` | Direct chat with Drizzy (personal comms bot) |
| `/login` | Passphrase login for cross-browser memory sync |

---

## Bots

| Bot | Persona | Domain |
|-----|---------|--------|
| Drake | Adrian | Automation, infrastructure, system ops |
| Drizzy | Ruby | Personal comms, social coordination, life management |
| Champagne Papi | Emerald | Financial intelligence, verification, diagnostics |
| Aubrey Graham | Adobe | Document parsing and entity extraction |
| 6 God | Anchor | Execution coordination, priority sequencing, follow-through |

All bots maintain persistent conversation history via DB-backed `ChatSession` records. Sessions are keyed to owner identity after `/login` or to a device cookie as a same-browser fallback.

## Ops Mission Control

- `/ops` reads and writes durable mission-control state from the Postgres-backed `mc*` tables
- campaign feed events, artifacts, blockers, execution attempts, and resume directives persist across reloads
- demo missions are marked in metadata so they can be seeded and removed without relying on name prefixes

## Watchdog

- `/watchdog` is the dedicated Mothership UI route watchdog dashboard
- `artifacts/mothership/src/components/watchdog/watchdog-dashboard.tsx` reads `/api/watchdog/latest` for the full latest UI watchdog report and `/api/ops/watchdog` for the mirrored ops summary
- monitored routes are defined in `artifacts/mothership/src/lib/watchdog/routes.ts`
- watchdog runs persist to `artifacts/mothership/runtime/ui-watchdog/latest.json` plus per-run `summary.json` files
- `/ops` also surfaces the latest UI watchdog status through the watchdog panel
- run `npm run ui-watchdog` in the Mothership app to generate a fresh report

---

## Tech Stack

- **Frontend:** Next.js 14 App Router, React, TypeScript, Tailwind, SWR
- **Backend:** Next.js API routes, Drizzle ORM, PostgreSQL (Supabase)
- **Bots:** OpenClaw gateway with named agents and SSE streaming
- **Wellness data:** Supabase `wellness_logs` table for cross-device sync
- **Voice:** Azure Speech STT/TTS
- **Realtime:** SSE-first with 30s polling fallback
- **PWA:** Web app manifest at `/public/manifest.json`

---

## Key API Routes

### Feeds

```text
GET  /api/v2/dashboard/today
GET  /api/v2/tasks
GET  /api/v2/bots
GET  /api/v2/email
GET  /api/v2/finance/overview
GET  /api/v2/activity/log?page=1&pageSize=50
GET  /api/v2/trophy?mode=week&week=0
```

### Mutations

```text
PATCH /api/v2/tasks/:id        { action: start|complete|defer|unblock|assign|vision_board }
POST  /api/v2/bots/session     GET ?bot=<key> → stable session ID
POST  /api/v2/auth/login       { passphrase } → sets owner cookie
POST  /api/v2/auth/logout
GET   /api/v2/auth/me
```

### Bot Dispatch

```text
POST /api/v2/adrian/dispatch   { text, sessionId }
POST /api/v2/ruby/dispatch     { text, sessionId }
POST /api/v2/emerald/dispatch  { text, sessionId }
POST /api/v2/adobe/dispatch    { text, sessionId }
POST /api/v2/anchor/dispatch   { text, sessionId }
```

### SSE Streams

```text
GET  /api/v2/stream/dashboard
GET  /api/v2/stream/bots
```

### Dispatch and Ops

```text
GET   /api/dispatch/campaigns
POST  /api/dispatch/campaigns
GET   /api/dispatch/campaigns/:id
POST  /api/dispatch/campaigns/:id/plan
POST  /api/dispatch/campaigns/:id/plan/approve
POST  /api/dispatch/campaigns/:id/run
GET   /api/dispatch/campaigns/:id/progress
POST  /api/dispatch/campaigns/:id/tasks
POST  /api/dispatch/campaigns/:id/tasks/:taskId/retry
POST  /api/dispatch/campaigns/:id/tasks/:taskId/review
POST  /api/dispatch/campaigns/:id/tasks/:taskId/replan
GET   /api/dispatch/output-folders
GET   /api/ops/campaigns/:id/feed
```

---

## Environment Variables

### Required

```text
DATABASE_URL
OPENCLAW_INFERENCE_GATEWAY
OPENCLAW_TOKEN
OPENCLAW_AGENT_EMERALD
```

### Database URL precedence

```text
POSTGRES_URL_NON_POOLING
POSTGRES_URL
DATABASE_URL
PRISMA_DATABASE_URL
DATABASE_POOLER_URL
DATABASE_URL_POOLER_TRANS
DATABASE_URL_POOLER_SESSION
```

Use the same database for every configured connection string. Mixing different hosts or databases causes data drift symptoms like items appearing in one surface but missing in Vision or Dispatch.

### Owner Auth

```text
OWNER_PASSPHRASE
OWNER_AUTH_SECRET
OWNER_EMAIL
```

### OpenClaw Agents

```text
OPENCLAW_AGENT_ADRIAN
OPENCLAW_AGENT_RUBY
OPENCLAW_AGENT_ADOBE
OPENCLAW_AGENT_ANCHOR
OPENCLAW_DEFAULT_AGENT
OPENCLAW_MODEL
OPENCLAW_STREAMS_PATH
```

### Email

```text
EMAIL_PROVIDER
EMAIL_INBOXES
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
ZOHO_IMAP_HOST
ZOHO_IMAP_PORT
ZOHO_IMAP_USERNAME
ZOHO_IMAP_PASSWORD
ZOHO_SMTP_HOST
ZOHO_SMTP_PORT
ZOHO_EMAIL_USER
ZOHO_EMAIL_PASS
```

### Voice

```text
AZURE_SPEECH_KEY
AZURE_SPEECH_REGION
AZURE_SPEECH_VOICE
```

### Integrations

```text
SUPABASE_URL
SUPABASE_ANON_KEY
GITHUB_TOKEN
TASK_POOL_REPO_OWNER
TASK_POOL_REPO_NAME
APP_TIMEZONE
```

---

## Build Command

```bash
npm run vercel-build
```

This applies pending Drizzle schema migrations on deploy before running the Next.js build.

---

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000/today](http://localhost:3000/today).

## Claude Terminal Server

The `/claude` terminal mode requires a separate WebSocket server and cannot run on Vercel serverless functions.

See `terminal-server/README.md` for deployment details if that server is present in your working copy.

---

## Cross-Browser Memory Setup

1. Add `OWNER_PASSPHRASE` to Vercel environment variables
2. Visit `/login` on any new browser
3. Enter the passphrase once to set a long-lived secure cookie
4. Bot conversations and session history will follow the owner identity across browsers and devices

---

## Trophy Collection

Completed tasks are stamped with `completedAt` and stored permanently in the database. View them at `/trophy` and navigate week by week to review completed work over time.
