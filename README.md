# Mothership

Personal agentic operations platform — tasks, bots, finance, email, and daily execution in one place.

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
| `/projects` | High-level project buckets — Creative, Robotic, Fund Dev, Home |
| `/vision` | Vision board — pillars, linked tasks, goals |
| `/trophy` | Win history — completed tasks grouped by day, week-over-week |
| `/ruby` | Direct chat with Drizzy (personal comms bot) |
| `/login` | Passphrase login for cross-browser memory sync |

---

## Bots (Drake Personas)

| Bot | Persona | Domain |
|-----|---------|--------|
| Drake 🦅 | Adrian | Automation, infrastructure, system ops |
| Drizzy 💌 | Ruby | Personal comms, social coordination, life management |
| Champagne Papi 🥂 | Emerald | Financial intelligence, verification, diagnostics |
| Aubrey Graham 📜 | Adobe | Document parsing and entity extraction |
| 6 God ⚡ | Anchor | Execution coordination, priority sequencing, follow-through |

All bots maintain persistent conversation history via DB-backed `ChatSession` records. Sessions are keyed to owner identity (cross-browser, after `/login`) or device cookie (same-browser fallback).

---

## Tech Stack

- **Frontend:** Next.js 14 App Router, React, TypeScript, Tailwind, SWR
- **Backend:** Next.js API routes, Drizzle ORM, PostgreSQL (Supabase)
- **Bots:** OpenClaw gateway with named agents + SSE streaming
- **Wellness data:** Supabase `wellness_logs` table (cross-device sync)
- **Voice:** Azure Speech STT/TTS (Jarvis card)
- **Realtime:** SSE-first with 30s polling fallback
- **PWA:** Web app manifest at `/public/manifest.json`

---

## Key API Routes

### Feeds
```
GET  /api/v2/dashboard/today
GET  /api/v2/tasks
GET  /api/v2/bots
GET  /api/v2/email
GET  /api/v2/finance/overview
GET  /api/v2/activity/log?page=1&pageSize=50
GET  /api/v2/trophy?mode=week&week=0
```

### Mutations
```
PATCH /api/v2/tasks/:id        { action: start|complete|defer|unblock|assign|vision_board }
POST  /api/v2/bots/session     GET ?bot=<key> → stable session ID
POST  /api/v2/auth/login       { passphrase } → sets owner cookie
POST  /api/v2/auth/logout
GET   /api/v2/auth/me
```

### Bot Dispatch (SSE streaming)
```
POST /api/v2/adrian/dispatch   { text, sessionId }
POST /api/v2/ruby/dispatch     { text, sessionId }
POST /api/v2/emerald/dispatch  { text, sessionId }
POST /api/v2/adobe/dispatch    { text, sessionId }
POST /api/v2/anchor/dispatch   { text, sessionId }
```

### SSE Streams
```
GET  /api/v2/stream/dashboard
GET  /api/v2/stream/bots
```

---

## Environment Variables

### Required
```
DATABASE_URL               # Supabase pooler URL (postgres://...)
OPENCLAW_INFERENCE_GATEWAY # AI gateway base URL
OPENCLAW_TOKEN             # Gateway auth token
OPENCLAW_AGENT_EMERALD     # Emerald agent ID (required — others fall back to this)
```

### Database URL precedence (important)
```
PRISMA_DATABASE_URL        # Optional explicit runtime DB URL (highest priority)
DATABASE_URL               # Primary DB URL for app + Prisma CLI
DATABASE_POOLER_URL        # Legacy fallback only when DATABASE_URL is not set
```

Use the **same database** for all three values (or leave unused values blank). Mixing different hosts/databases causes
data drift symptoms like items showing in one surface but missing in Vision/Dispatch.

### Owner Auth
```
OWNER_PASSPHRASE           # Secret passphrase for /login (cross-browser memory)
OWNER_EMAIL                # Owner email for user upsert (default: hello@nuriy.com)
```

### OpenClaw Agents (optional — fall back to OPENCLAW_AGENT_EMERALD)
```
OPENCLAW_AGENT_ADRIAN
OPENCLAW_AGENT_RUBY
OPENCLAW_AGENT_ADOBE
OPENCLAW_AGENT_ANCHOR
OPENCLAW_DEFAULT_AGENT
OPENCLAW_MODEL
```

### Email
```
EMAIL_PROVIDER             # gmail | zoho
EMAIL_INBOXES
# Gmail
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
# Zoho IMAP
ZOHO_IMAP_HOST
ZOHO_IMAP_PORT
ZOHO_IMAP_USERNAME
ZOHO_IMAP_PASSWORD
# Zoho SMTP
ZOHO_SMTP_HOST
ZOHO_SMTP_PORT
ZOHO_EMAIL_USER
ZOHO_EMAIL_PASS
```

### Voice (optional)
```
AZURE_SPEECH_KEY
AZURE_SPEECH_REGION        # e.g. eastus2
AZURE_SPEECH_VOICE         # default: en-US-AriaNeural
```

### Integrations (optional)
```
SUPABASE_URL               # For wellness_logs cross-device sync
SUPABASE_ANON_KEY
GITHUB_TOKEN               # Task pool repo access
TASK_POOL_REPO_OWNER
TASK_POOL_REPO_NAME
APP_TIMEZONE               # default: America/New_York
```

---

## Build Command (Vercel)

```
npm run vercel-build
```

This applies pending Drizzle schema migrations on deploy before running the Next.js build.

---

## Local Development

```bash
npm install
cp .env.example .env.local   # fill in secrets
npm run dev
```

Open [http://localhost:3000/today](http://localhost:3000/today).

## Claude Terminal Server (WebSocket backend)

The `/claude` terminal mode requires a separate WebSocket server (`terminal-server/`) and cannot run on Vercel serverless functions.

DigitalOcean Droplet deployment guide: `terminal-server/README.md`.

---

## Cross-Browser Memory Setup

1. Add `OWNER_PASSPHRASE` to Vercel environment variables
2. Visit `/login` on any new browser
3. Enter the passphrase once — sets a 1-year secure cookie
4. Bot conversations and session history now follow you across all browsers and devices

---

## Trophy Collection

Completed tasks are stamped with `completedAt` and stored permanently in the database. View them at `/trophy` — navigate week by week to see your wins over time. The Today page trophy modal shows today's completions and links to the full history.

---

Maintainer: Nuriy · Built with Mothership + Claude
