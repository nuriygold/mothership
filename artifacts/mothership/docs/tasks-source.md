### V2 task source wiring

This project supports two task sources for the V2 tasks feed:

- `task_pool_repo`: pull tasks from GitHub Issues in the task-pool repository.
- `database` / `db` / `none` (or any other non-task-pool value): pull tasks from the local database-backed `tasks` table.

The runtime normalizes `MOTHERSHIP_TASK_SOURCE` in `src/lib/integrations/task-pool.ts`:

- Values that resolve to `task_pool_repo`:
  - `task_pool_repo`
  - `task_pool`
  - `task-pool`
  - `github_task_pool`
  - any value containing both `github.com` or `github.io` and `task-pool`
- Values that stay non-task-pool:
  - `database`
  - `db`
  - `none`
  - any other unrecognized value remains unchanged and is treated as non-task-pool by `isTaskPoolRepositorySource()`

### Task-pool mode

When `MOTHERSHIP_TASK_SOURCE` resolves to `task_pool_repo`, `listTasks()` in `src/lib/services/tasks.ts` does this:

1. Calls `listTaskPoolTasks()`.
2. `listTaskPoolTasks()` calls `getTaskPoolIssues()`.
3. `getTaskPoolIssues()` tries the live GitHub Issues API first:
   - `GET /repos/{owner}/{repo}/issues?state=all&per_page=100`
4. If the live Issues request fails, it falls back to a snapshot in this order:
   - `https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{snapshotPath}`
   - GitHub Contents API: `GET /repos/{owner}/{repo}/contents/{snapshotPath}?ref={branch}`
5. If either live Issues or snapshot data is available, the issues are mapped into internal task objects and returned.
6. If all GitHub and snapshot fetches fail, `listTasks()` logs a warning and falls back to the database query.

#### GitHub Issue → internal task mapping

`src/lib/integrations/task-pool.ts` maps each GitHub Issue with `toTaskPoolTask()`:

- `id`: `tpt_{issue.number}`
- `title`: `issue.title`
- `description`: `issue.body`
- `domain`:
  - first label starting with `domain:`
  - defaults to `ops` if missing or empty
- `workflowId`: `tpw_{slug(domain)}`
- `status`:
  - closed issue → `DONE`
  - label `status:blocked` → `BLOCKED`
  - label `status:active` → `IN_PROGRESS`
  - label `status:waiting` → `TODO`
  - otherwise open issue defaults to `TODO`
- `priority`:
  - `priority:A+` → `CRITICAL`
  - `priority:A` → `HIGH`
  - `priority:B` → `MEDIUM`
  - `priority:C` → `LOW`
  - missing priority defaults to `MEDIUM`
- `owner`:
  - first GitHub assignee login becomes `ownerName`
  - `ownerId` becomes `gh:{login}`
  - no assignee → `ownerId = null`
- `dueAt`:
  - parsed from the issue body only
  - supported formats are line-based `Due: YYYY-MM-DD`, `Deadline: YYYY-MM-DD`, or `YYYY-MM-DD due/deadline`
  - stored as `YYYY-MM-DDT00:00:00.000Z`
- `sourceChannel`: always `task_pool_repo`
- `sourceUrl`: `issue.html_url`

### Database mode

When `MOTHERSHIP_TASK_SOURCE` does not resolve to `task_pool_repo`, `listTasks()` skips GitHub entirely and reads from the local `tasks` table via `selectTaskRows()`.

That query joins:

- `tasks`
- `users`
- `workflows`

and returns DB-backed tasks ordered by `tasks.createdAt DESC`.

There is also a safety fallback while still in task-pool mode:

- if GitHub Issues and both snapshot fetches are unavailable, `listTasks()` falls back to the database query
- if the DB query also fails, `listTasks()` returns an empty array

### V2 tasks feed behavior

`getV2TasksFeed()` in `src/lib/v2/orchestrator.ts` always starts from `listTasks()` and then maps each task into the V2 feed.

#### Source label: GitHub vs Internal

The V2 feed shows task source like this:

- `GitHub` when `task.sourceChannel` is a string containing `task_pool`
- `Internal` for everything else

That means:

- task-pool tasks appear as `GitHub`
- DB tasks appear as `Internal`

#### Timeframe and due dates

The V2 feed computes due-date metadata like this:

- timezone: `process.env.APP_TIMEZONE || 'America/New_York'`
- `dueAtISO`:
  - `task.dueAt ? new Date(task.dueAt).toISOString() : null`
- `timeframe`:
  - if `dueAtISO` exists, it is formatted with `toLocaleDateString('en-US', { timeZone: APP_TIMEZONE, month: 'numeric', day: 'numeric', year: 'numeric' })`
  - if no due date exists, timeframe is `Today`

For task-pool tasks specifically, `dueAt` comes from parsing the GitHub Issue body, not from labels.

### Dispatch campaigns and the shared feed

Dispatch campaigns publish tasks into the same task-pool repository through `createTaskPoolIssue()` in `src/lib/services/dispatch.ts`.

Current flow:

- when dispatch creates campaign tasks, it attempts to create GitHub Issues after the DB transaction completes
- replacement dispatch tasks are also published the same way
- created Issues use titles like `[Dispatch] {task.title}`
- dispatch publishes them with `workflowId: 'tpw_dispatch'`, which becomes the `domain:dispatch` label on the GitHub Issue
- once those Issues exist in `nuriygold/task-pool`, they are picked up by `listTaskPoolTasks()` and appear in the same V2 tasks feed as any other task-pool task

If `GITHUB_TOKEN` is missing during dispatch publishing, issue creation is skipped and dispatch continues without failing the campaign.

### Recommended environment defaults

Use these defaults for task-pool mode:

```env
MOTHERSHIP_TASK_SOURCE=task_pool_repo
TASK_POOL_REPO_OWNER=nuriygold
TASK_POOL_REPO_NAME=task-pool
TASK_POOL_REPO_BRANCH=main
TASK_POOL_SNAPSHOT_PATH=data/task-pool-snapshot.json
```

`GITHUB_TOKEN` should be configured at runtime for:

- live Issues reads from `GET /repos/{owner}/{repo}/issues`
- snapshot fallback through the GitHub Contents API
- task creation / updates / label writes used by dispatch and task editing

Notes:

- the raw snapshot URL on `raw.githubusercontent.com` does not send an Authorization header in the current implementation, so it may still work without a token if the repo/path is publicly readable
- the Contents API fallback requires `GITHUB_TOKEN`
- live Issues reads are attempted even without a token, but authenticated access is safer for rate limits and private-repo access

### Manual sanity checklist

#### 1. Task-pool mode sanity test

1. Set:
   - `MOTHERSHIP_TASK_SOURCE=task_pool_repo`
   - `TASK_POOL_REPO_OWNER=nuriygold`
   - `TASK_POOL_REPO_NAME=task-pool`
   - `TASK_POOL_REPO_BRANCH=main`
   - `TASK_POOL_SNAPSHOT_PATH=data/task-pool-snapshot.json`
   - valid `GITHUB_TOKEN`
2. Create an Issue in `nuriygold/task-pool` with labels such as:
   - `domain:ops`
   - `status:active`
   - `priority:A`
3. Optionally add a due date line in the body, for example:
   - `Due: 2026-05-20`
4. Load the V2 tasks feed.
5. Confirm the task appears with:
   - source = `GitHub`
   - domain-derived workflow/department
   - status = `Active`
   - priority = `High`
   - due date/timeframe matching `APP_TIMEZONE`

#### 2. Database mode sanity test

1. Set `MOTHERSHIP_TASK_SOURCE=database`.
2. Insert a row into the local `tasks` table with a valid `workflowId` and optional `dueAt`.
3. Load the V2 tasks feed.
4. Confirm the task appears with:
   - source = `Internal`
   - status/priority coming from DB values
   - workflow name coming from the joined `workflows` row
   - due date/timeframe based on the DB `dueAt` value

### Known edge cases

- `MOTHERSHIP_TASK_SOURCE=none` is treated as non-task-pool and therefore still uses the database path; it does not disable tasks entirely.
- Unrecognized `MOTHERSHIP_TASK_SOURCE` values log a warning but still behave like database mode because only exact `task_pool_repo` enables GitHub mode.
- `GET /issues?per_page=100` does not paginate, so only the first 100 issues are currently read from the live GitHub API.
- `status:done` is written when updating a task-pool issue to done, but read-side status mapping relies primarily on the issue being closed; an open issue with only `status:done` would still map as `TODO`.
- `dueAt` parsing only supports specific date patterns in the issue body and always normalizes to midnight UTC.
