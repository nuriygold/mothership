# /ops — Test Script & Demo Walkthrough

A guided tour of the Ops mission-control surface for personal understanding,
QA, and the Vercel WDK hackathon submission video.

---

## What this system actually is

`/ops` is a **mission control plane** for durable, AI-powered agent workflows.
The architecture, end-to-end:

| Layer | Responsibility | Where it lives |
| --- | --- | --- |
| **UI** | Mission cards, live feed, watchdog, rules | `app/ops/**`, `components/ops/**` |
| **API** | REST endpoints the UI talks to | `app/api/ops/**/route.ts` |
| **Mission registry** | Thin in-memory mirror of workflow state | `lib/ops/store.ts` |
| **Runtime adapter** | Bridge from API → Workflow SDK | `lib/ops/runtime.ts` |
| **Durable workflow** | The actual long-running agent run | `lib/ops/workflows/mission.ts` |
| **Workflow steps** | Atomic, retryable units the workflow calls | `lib/ops/workflows/steps.ts` |
| **Model provider** | All AI calls route through here | Vercel AI Gateway (zero-config) |

When the operator dispatches a mission, the API route calls
`dispatchMission()` → `start(missionWorkflow, [...])`. The Workflow SDK
sandboxes the workflow function in a durable VM. Inside it, a
`DurableAgent` from `@workflow/ai` runs an LLM tool loop against the
AI Gateway, calling step functions to do real I/O (write artifacts,
validate them, escalate blockers). If the server restarts, the
workflow resumes from its last successful step. The UI just polls the
registry every 4 seconds and re-renders.

---

## Test script (personal walkthrough)

### 1. Reach the page

- Navigate to `/login`. The "View Ops mission control" link below the
  passphrase form takes you to `/ops` without logging in (it's
  whitelisted in `middleware.ts` so demo viewers can reach it).

### 2. Empty state

You should see:

- A centered card that says **"No missions in flight"**.
- A green **"Load demo missions"** button.
- A floating green **Dispatch** FAB at the bottom right.
- A scrolling status ticker that says "No active missions".
- A live "Watchdog" panel with no rows.
- A "System Rules" panel with toggles for execution mode, fallback
  enforcement, batch size, and watchdog interval.

### 3. Load demo missions

Click **Load demo missions**. Three campaigns appear:

| Mission | Lead | Status | What it shows |
| --- | --- | --- | --- |
| Demo: Shopify Catalog Audit | Adrian | RUNNING | Healthy progress bar, info + warn feed events, two artifacts |
| Demo: Finance Recon (Apr 2026) | Marvin | BLOCKED | Red blocker chip, awaiting operator approval |
| Demo: Mothership Deploy v0.142.0 | Iceman | COMPLETED | All artifacts present, 100% progress, success feed |

The ticker now scrolls live mission names. The watchdog panel shows
the BLOCKED mission. The header shows "Live · 1 active".

### 4. Drill into a mission

Click the **Demo: Shopify Catalog Audit** card. You land on
`/ops/campaigns/[id]` and see:

- A live execution feed (info, warn, success events, color-coded).
- An artifacts panel listing `products.md` and `action-log.md`. Click
  one — the artifact preview modal shows the markdown content.
- Execution controls: **Resume**, **Force Retry**, **Approve**,
  **Escalate**, **Kill**.
- A "Blocker" section (empty for this mission, populated for the
  Marvin one).

### 5. Demonstrate operator control

- Go to **Demo: Finance Recon**.
- Notice the red BLOCKED chip and the blocker reading
  "Awaiting operator approval to cancel duplicate Notion subscription".
- Click **Approve**. The status flips to RUNNING; a success feed event
  appears: "Operator approved pending action".
- Or click **Kill** on any mission. Status flips to COMPLETED; a red
  feed event appears. If a real WDK run is attached (`runId` set), the
  runtime adapter also calls `world.events.create({ eventType: "run_cancelled" })`
  to terminate the durable workflow.

### 6. Real dispatch (WDK + AI Gateway)

Click the **Dispatch** FAB.

- Fill **Campaign name**: `Hackathon test mission`.
- Fill **Objective**: `Produce a one-page summary of why durable
  workflows matter for agent reliability.`
- Pick **Lead agent**: any.
- Toggle required artifact: `action-log.md`.
- Click **Start Campaign**.

What happens:

1. `POST /api/ops/campaigns` runs.
2. `dispatchMission()` creates the campaign in the registry.
3. `start(missionWorkflow, [...])` is called.
4. The workflow is admitted into the WDK runtime.
5. Inside the workflow, `DurableAgent` opens a streaming connection to
   Anthropic Claude (default) **through the Vercel AI Gateway** — no
   API key is required because Vercel injects gateway credentials.
6. The agent reasons step-by-step, calling tool functions (each a
   `'use step'` function) to write the required artifact.
7. As each step completes, the workflow records a feed event via the
   `recordEvent` step, which mutates the in-memory registry. The UI's
   4-second poll picks this up and the feed scrolls live.
8. When all required artifacts are produced, the workflow flips the
   mission to COMPLETED.

If you see the campaign sit at IDLE with a warn-level feed event that
says **"WDK runtime not available"**, the runtime isn't deployed (e.g.
local without `npx workflow dev`). Real dispatch requires either
`npx workflow dev` running locally, or a Vercel deployment with
Workflow enabled on the project.

### 7. Watchdog & system rules

- Toggle **Execution Mode** → Aggressive in the System Rules panel. A
  PATCH request goes to `/api/ops/system-rules`. Refresh — the toggle
  persists for the lifetime of the server process (in-memory).
- Click **Force Resume All** in the watchdog panel. Any BLOCKED mission
  flips to RUNNING with a "Watchdog: force-resume" feed event.

### 8. Cleanup

Click **Clear demo** in the active-campaigns header. All campaigns
named `Demo:` are removed; any real missions you dispatched stay.

---

## Recording script for the hackathon submission

A 2–3 minute outline that maps to the test steps above.

| Time | Beat | What to say |
| --- | --- | --- |
| 0:00 | Land on `/ops` empty state | "Mothership Ops is a mission control plane for durable AI agents. We start with no missions in flight." |
| 0:15 | Click **Load demo missions** | "These are three example missions in different states — Shopify catalog audit running, finance recon blocked on an approval, and a deploy that just shipped." |
| 0:30 | Click into the Shopify mission | "Each mission is a durable Vercel Workflow run. The agent calls Anthropic Claude through the Vercel AI Gateway to reason, then calls tool steps to do real I/O — the products.md artifact you see is what the workflow actually produced." |
| 0:55 | Show artifact preview | "Artifacts are the workflow's deliverables. The mission only completes when every required artifact is present and validated." |
| 1:10 | Switch to the Finance Recon mission | "Marvin hit a blocker. Because workflows are durable, we can pause for hours or days waiting for operator approval — the workflow stays alive, no polling, no cron." |
| 1:25 | Click **Approve** | "One operator click resumes the workflow. Under the hood, this is a `resumeHook()` call to the Workflow SDK." |
| 1:40 | Open the Dispatch FAB | "Dispatching a new mission starts a fresh durable workflow run. Each `start()` call returns a runId — the WDK runtime takes over from there." |
| 1:55 | Show the live feed updating | "The /ops surface polls every 4 seconds. The workflow is the source of truth — the UI is just a thin reader." |
| 2:15 | Cut to architecture | "Three primitives — Workflow SDK for durability, AI Gateway for model routing, Drizzle on Supabase for state — give us long-running, recoverable agent runs with operator override." |
| 2:30 | End on `/ops` overview shot | (closing card) |

---

## Curl examples (`scripts/ops-demo.sh`)

You can drive the system entirely from the terminal during recording.
See `scripts/ops-demo.sh` for the full set of commands.

```bash
# Set this once
export OPS_HOST="http://localhost:3000"

# 1. Load demo missions
curl -X POST $OPS_HOST/api/ops/demo-seed | jq

# 2. List campaigns
curl $OPS_HOST/api/ops/campaigns | jq

# 3. Dispatch a real workflow
curl -X POST $OPS_HOST/api/ops/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hackathon test mission",
    "objective": "Summarize why durable workflows matter",
    "leadAgentId": "agent_adrian",
    "requiredArtifacts": ["action-log.md"],
    "minimumBatchSize": 1,
    "executionMode": "STANDARD"
  }' | jq

# 4. Read the live feed of a campaign
CAMPAIGN_ID="camp_xxxxxxx"  # from step 2 or 3
curl $OPS_HOST/api/ops/campaigns/$CAMPAIGN_ID/feed | jq

# 5. Approve a blocked mission
curl -X POST $OPS_HOST/api/ops/campaigns/$CAMPAIGN_ID/control \
  -H "Content-Type: application/json" \
  -d '{"action": "approve_action"}' | jq

# 6. Kill a mission (cancels the durable workflow run too)
curl -X POST $OPS_HOST/api/ops/campaigns/$CAMPAIGN_ID/control \
  -H "Content-Type: application/json" \
  -d '{"action": "kill"}' | jq

# 7. Reset
curl -X DELETE $OPS_HOST/api/ops/demo-seed | jq
```

---

## Reading the system

Five files tell the whole story. Read them in this order:

1. `lib/ops/types.ts` — domain language (Campaign, FeedEvent, etc.).
2. `lib/ops/store.ts` — the in-memory mission registry. Tiny.
3. `lib/ops/workflows/steps.ts` — what the agent can actually *do* (every
   external effect is a `'use step'` function).
4. `lib/ops/workflows/mission.ts` — the orchestration. Notice
   `'use workflow'`, `DurableAgent`, AI Gateway model string,
   validate/retry loop, and `FatalError` for blockers.
5. `lib/ops/runtime.ts` — the bridge. Lazy-loads the workflow runtime
   so a misconfigured runtime never breaks `next build`.

That's it. Everything else (`app/ops`, `components/ops`,
`app/api/ops`) is plumbing on top of those five.
