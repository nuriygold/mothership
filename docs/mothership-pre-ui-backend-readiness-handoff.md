# Mothership Pre-UI Backend Readiness Handoff

Branch:
`joy/pre-ui-readiness-hardening`

Checkpoint commit:
`71ef0dd` Harden active ops dispatch mirroring

Runtime:
Mothership Express API is running under PM2 as `mothership-api-4100`.
Local API health endpoint:
`http://127.0.0.1:4100/api/healthz`

Port ownership:
- LiteLLM: `127.0.0.1:4000` and `127.0.0.1:4001`
- OpenClaw: `127.0.0.1:18789`
- VoltAgent: `127.0.0.1:3141`
- macOS ControlCenter: `5000` and `7000`
- Mothership API: `4100`

Architecture decision:
Durable Ops is the authoritative control plane.
Legacy Dispatch is the MVP execution worker.
Frontend campaign ingress should go through `/api/ops/*`.
Legacy `/api/dispatch/*` ingress is disabled by default unless explicitly enabled for controlled debugging.

Implemented and verified:
1. Local Vite `/api` fallback points to Mothership API on `4100`, not LiteLLM.
2. Unsafe ops error serialization was patched so failed `/api/ops/campaigns` responses remain valid JSON.
3. Durable Ops to Dispatch bridge is source-implemented.
4. Dispatch to Durable Ops active mirroring is source-implemented.
5. Dispatch claim, lease, heartbeat, and attempt count fields exist in live DB.
6. API server runs under PM2 and survives long-running verification.
7. Active Dispatch to Ops mirroring passed.
8. Terminal-state propagation passed.
9. Duplicate-run claim guard passed.
10. Crash recovery passed.

Validation results:
- Active mirror smoke test:
  PASS
  saw_running=true
  Durable Ops showed running while Dispatch was actively executing.

- Terminal-state follow-up:
  PASS
  Campaign reached a valid terminal state.
  One campaign completed end-to-end with `progress=1` and `blocker=null`.

- Duplicate-run claim guard:
  PASS
  Two parallel resume calls did not create two execution workers.
  The second path hit the expected guard:
  `Campaign is already claimed by another execution or is not in a runnable state.`

- Crash recovery:
  PASS
  Test campaign:
  `799d5c6f-96fe-4172-b8c1-9ad042ebad70`
  API was stopped with:
  `pm2 stop mothership-api-4100`
  API was restarted with:
  `pm2 restart mothership-api-4100`
  PM2 logs showed:
  `ops engine bootstrapped`
  `resumed: 2`
  `Engine rehydrated campaign after restart`
  Campaign did not remain stuck in `running`.
  It transitioned to `BLOCKED` with blocker:
  `type: dispatch_execution`
  `attempts: 1`
  `requiredInput: Retry or replan the failed dispatch task(s)`

Remaining known gaps:
1. The specific dispatch task failure after crash recovery has been triaged as a session write-lock timeout, not a repo-size problem. The worker hit `SessionWriteLockTimeoutError` while persisting the task session, and dispatch task execution now uses a per-attempt session key to avoid reusing the same OpenClaw session across retries.
2. Stale-lease recovery was not isolated as a standalone forced expired-lease test, although crash recovery exercised the broader recovery path.
3. Production `/api` routing exists in source but still needs deployed `API_BASE_URL` verification.
4. UI testing has not started and should wait until production `/api` routing is verified.
5. Working tree still has pre-existing dirty and untracked files outside the committed slice.
6. Branch has not been pushed and no PR has been created.

Triage note:
The failed dispatch task on the crash-recovery campaign was task 1,
`5b316e91-d84d-476e-b177-276e51bf3221`.
Its recorded failure was:
`The operation was aborted due to timeout`
The deeper cause in the OpenClaw logs was a session persistence lock timeout:
`SessionWriteLockTimeoutError: session file locked (timeout 60000ms)`.
The jobsite itself is tiny, so this points to OpenClaw task/session contention, not path size, missing ignore rules, or the wrong workspace path.
The stale `errorMessage` on the task row was cleared on retry start and on successful completion, so the final state now reports only the live task outcome.

Recommended next sequence:
1. Triage the failed dispatch task from crash recovery.
2. Decide whether to run one isolated stale-lease test with a deliberately expired `EXECUTING` row.
3. Verify deployed production `/api/healthz` through the frontend origin after setting `API_BASE_URL`.
4. Run a small UI smoke test against the verified backend.
5. Push branch and open PR after reviewing dirty working tree.

Do not regress these constraints:
- Do not bind Mothership to `4000` or `4001`.
- Do not use `5000` or `7000` on this Mac Mini.
- Do not restore `OPENCLAW_MODEL=gpt-5.4-pro`.
- Do not re-enable legacy dispatch HTTP ingress as a default frontend path.
- Do not use broad `git add .` while the working tree contains pre-existing unrelated changes.
