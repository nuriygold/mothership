# Anchor-First Dispatch Upgrade Plan for Mothership

## Objective
Turn Mothership into a true **Anchor-led dispatch point** where:
1. The user speaks to Anchor in natural language.
2. Anchor detects human-only vs bot-suitable work.
3. Anchor routes bot-suitable work to the right specialist bot automatically (or emits exact commands when in "manual dispatch" mode).
4. Dispatch/Bots UI makes delegation, progress, and handoffs explicit.

This plan is based on the target behavior shown in the conversation transcript ("you are Anchor", momentum-first coaching, strict no-loop behavior, exact delegation commands).

---

## Product Principles to Encode

### 1) Anchor is a **router + momentum coach**, not a generic assistant
- Anchor should prioritize momentum and reduce cognitive load.
- Anchor should actively prevent optimization/research loops.
- Anchor should output a short execution plan + clear done-state.

### 2) Human-only vs bot-eligible classification is first-class
- Human-only: body/presence tasks (bathe, grooming, driving, watch movie).
- Bot-eligible: scheduling, calling scripts/prep, research, paperwork, signup prep, ops automation.
- Every user request should be split into these buckets before planning.

### 3) Delegation must be deterministic and visible
- Every delegated task should include:
  - selected bot
  - reason for routing
  - expected output contract
  - status updates
- If auto-delegation is disabled, Anchor should return exact command text (e.g. `@Adrian ...`).

### 4) Time and timezone must be explicit
- Anchor should always normalize to user timezone and print absolute times.
- Planning output should include `Current time`, time blocks, and final outcome checklist.

---

## Current System Assessment (What to Reuse)

### Dispatch page
- `app/dispatch/page.tsx` already supports campaign/task creation, planning, run controls, retries, reviews, and recommendations.
- This should remain the execution cockpit, but gain an Anchor-first conversation panel and routing rationale view.

### Bots page
- `app/bots/page.tsx` already supports per-bot instruction streaming and stable session IDs.
- Keep this as deep-dive bot control, but integrate a shared thread/correlation ID so dispatch handoffs are traceable.

### Orchestration layer
- `lib/v2/orchestrator.ts` already stores bot profiles and role assumptions.
- Add explicit Anchor policy + routing taxonomy instead of implicit/regex-only behavior.

### Dispatch service
- `lib/services/dispatch.ts` already handles campaigns, planning, routing recommendations, retries, and review loops.
- Extend it with first-class `anchor_intake` + `delegation` artifacts so conversation-native requests become dispatch-native records.

---

## Target UX

### A) New "Talk to Anchor" entry point on Dispatch
Input: plain language message.

Output sections:
1. **Anchor Plan** (short timeline + done-state)
2. **Human-Only Tasks** (checkbox list)
3. **Delegations** (bot, command, expected output)
4. **Execution Controls**
   - `Delegate now`
   - `Show exact commands`
   - `Hold Emerald research`

### B) Mode toggle
- **Auto Dispatch Mode**: Anchor sends tasks directly to bot endpoints.
- **Manual Command Mode**: Anchor returns exact commands for user to paste/send.

### C) Conversation memory contract
Anchor should remember across turns:
- preferred timezone
- preferred delegation mode
- no-loop preference
- active bot roster/aliases

### D) Trust UI
For each delegation, show:
- why this bot was chosen
- what success looks like
- latest bot output snippet

---

## Implementation Plan (Phased)

## Phase 1 — Data model + contracts

### 1.1 Add dispatch artifacts
Add new records (Prisma + API DTOs) for:
- `AnchorSessionPreference`
  - `timezone`, `dispatchMode`, `noLoopEnabled`, `defaultResearchPolicy`
- `DispatchDelegation`
  - `campaignId`, `taskId?`, `sourceMessageId`, `targetBot`, `commandText`, `status`, `rationale`, `expectedOutput`
- `AnchorIntakeMessage`
  - raw user input, parsed intents, detected human-only tasks, detected bot tasks

### 1.2 Formalize routing taxonomy
Create a typed map (e.g. `lib/dispatch/routing-taxonomy.ts`) that defines:
- capability tags per bot
- disallowed task types per bot
- tie-break rules (e.g., personal admin => Ruby, automation => Adrian, analysis-only => Emerald)

### 1.3 Add deterministic classifier
Implement a pure function:
- input: user message + optional context
- output: `humanOnly[]`, `delegateable[]`, confidence, unknowns

This becomes the first step in Anchor planning.

---

## Phase 2 — Anchor planner behavior

### 2.1 Add `buildAnchorDispatchPlan()` service
Create service layer function that returns:
- `currentTime` in user timezone
- proposed time blocks
- done-state outcomes
- delegations (with command text + expected output schema)

### 2.2 Add anti-loop policy
Encode guardrails:
- "no research unless requested"
- "one primary objective at a time"
- "stop condition after submit/confirm"

### 2.3 Add exact command synthesis
For manual mode, generate bot-ready commands:
- `@Adrian ...`
- `@Ruby ...`
- `@Emerald stand by ...`

Make these generated from templates instead of freeform prompt drift.

---

## Phase 3 — Dispatch UI upgrade

### 3.1 Enhance `app/dispatch/page.tsx`
Add a top-level Anchor panel with:
- message composer
- timezone badge + quick change control
- mode toggle (Auto / Manual)
- response cards (Plan, Human-only, Delegations)

### 3.2 Delegation action bar
Per delegation card:
- `Send`
- `Edit command`
- `Re-route bot`
- `Mark completed`

### 3.3 Outcome tracking widget
Show explicit nightly outcomes (from conversation pattern):
- e.g., `Roadie submitted`, `Appointment scheduled`, `Relaxation block completed`

---

## Phase 4 — Bots page alignment

### 4.1 Add inbound delegation context
In `app/bots/page.tsx`, display when a prompt came from Anchor dispatch:
- campaign/task link
- expected output contract
- due-by time

### 4.2 One-click response back to dispatch
Bot outputs should be attachable to the originating delegation with one action.

### 4.3 Session continuity
Use shared session keys between Anchor and bot instruction streams for traceability.

---

## Phase 5 — Observability + safety

### 5.1 Routing quality metrics
Track:
- delegation acceptance rate
- reassignment rate
- completion latency by bot
- user override rate

### 5.2 Failure handling
If bot unavailable:
- fallback suggestion
- preserve manual command text
- offer "retry on this bot" vs "reroute"

### 5.3 Policy assertions/tests
Add unit tests for:
- human-only classification
- routing taxonomy decisions
- command generation templates
- timezone rendering correctness

---

## Suggested File-Level Change List

1. `prisma/schema.prisma`
   - add Anchor session/delegation/intake models.
2. `lib/services/dispatch.ts`
   - add intake-to-delegation pipeline.
3. `lib/v2/orchestrator.ts`
   - enforce Anchor role policy + taxonomy integration.
4. `app/dispatch/page.tsx`
   - add Anchor conversation + delegation controls.
5. `app/bots/page.tsx`
   - add dispatch-origin context + return-to-dispatch actions.
6. `app/api/dispatch/...`
   - endpoints for intake, delegation send, preference updates.
7. `lib/dispatch/*`
   - new classifier, taxonomy, command templating modules.

---

## Acceptance Criteria (Definition of "Perfect Dispatch Point")

1. User can type a natural request to Anchor once and receive:
   - timezone-aware plan,
   - human-only list,
   - delegation list with exact commands.
2. Anchor can run in Auto or Manual mode, switchable per session.
3. Every delegation is visible and traceable from Dispatch to Bots and back.
4. Anchor defaults to no-loop behavior unless user requests research depth.
5. The system produces clear done-state outcomes, not just suggestions.

---

## Rollout Strategy

### Milestone 1 (MVP)
- manual mode only
- exact command generation
- human-only split
- dispatch UI card rendering

### Milestone 2
- auto-dispatch execution
- delegation status sync with bots page
- outcome tracking widget

### Milestone 3
- analytics + reroute intelligence
- personalization (habit/tone/strictness profiles)

---

## Notes for Prompt/Behavior Authoring

When writing Anchor system prompts, pin these constraints:
- "You are Anchor, a dispatcher and momentum coach."
- "Delegate anything bot-suitable; keep human-only tasks with the user."
- "Use explicit time blocks in user timezone."
- "Always include 2-5 concrete outcomes."
- "Avoid research expansion unless explicitly requested."
- "If manual mode, output exact bot commands."

