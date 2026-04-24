import crypto from 'node:crypto';
import { TaskPriority, TaskStatus, WorkflowStatus, WorkflowType } from '@/lib/db/prisma-types';

const DEFAULT_OWNER = 'nuriygold';
const DEFAULT_REPO = 'task-pool';
const DEFAULT_BRANCH = 'main';
const DEFAULT_SNAPSHOT_PATH = 'data/task-pool-snapshot.json';
let didLogSourceNormalization = false;
let didWarnInvalidSource = false;

function logTaskPoolEvent(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}) {
  const payload = {
    service: 'task_pool',
    event,
    ...data,
    timestamp: new Date().toISOString(),
  };
  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }
  if (level === 'warn') {
    console.warn(JSON.stringify(payload));
    return;
  }
  console.info(JSON.stringify(payload));
}

type GitHubIssueLabel = { name?: string };
type GitHubIssueAssignee = { login?: string };

type GitHubIssue = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<GitHubIssueLabel | string>;
  assignees?: GitHubIssueAssignee[];
  html_url: string;
  created_at: string;
  updated_at: string;
};

type TaskPoolSnapshot = {
  generated_at?: string;
  issues?: GitHubIssue[];
};

export type TaskPoolTask = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  workflowId: string;
  ownerId: string | null;
  ownerName: string | null;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  workflow: {
    id: string;
    name: string;
    type: WorkflowType;
    status: WorkflowStatus;
  };
  owner: null;
  sourceChannel: 'task_pool_repo';
  sourceUrl: string;
  statusLabel: string;
  priorityLabel: string;
  domain: string;
};

export type TaskPoolWorkflow = {
  id: string;
  name: string;
  description: string;
  type: WorkflowType;
  status: WorkflowStatus;
  submissions: Array<{
    id: string;
    sourceChannel: string;
    validationStatus: string;
  }>;
  runs: Array<{
    id: string;
    type: string;
    sourceSystem: string;
    status: string;
  }>;
  tasks: TaskPoolTask[];
  createdAt: Date;
  updatedAt: Date;
};

export type TaskPoolActivityEvent = {
  id: string;
  entityType: 'task';
  entityId: string;
  eventType: 'completed' | 'blocked' | 'updated';
  actorId: null;
  metadata: Record<string, string>;
  createdAt: Date;
};

function getConfig() {
  const rawSource = (process.env.MOTHERSHIP_TASK_SOURCE ?? 'task_pool_repo').trim().toLowerCase();
  const normalizedSource =
    rawSource === 'task_pool_repo' ||
    rawSource === 'task_pool' ||
    rawSource === 'task-pool' ||
    rawSource === 'github_task_pool' ||
    (rawSource.includes('github.com') && rawSource.includes('task-pool'))
      ? 'task_pool_repo'
      : rawSource;

  if (rawSource !== normalizedSource && !didLogSourceNormalization) {
    logTaskPoolEvent('info', 'source_normalized', { rawSource, normalizedSource });
    didLogSourceNormalization = true;
  }

  const recognized = ['task_pool_repo', 'database', 'db', 'none'];
  if (!recognized.includes(normalizedSource) && !didWarnInvalidSource) {
    logTaskPoolEvent('warn', 'invalid_source_value', { rawSource, normalizedSource });
    didWarnInvalidSource = true;
  }

  return {
    source: normalizedSource,
    owner: process.env.TASK_POOL_REPO_OWNER ?? DEFAULT_OWNER,
    repo: process.env.TASK_POOL_REPO_NAME ?? DEFAULT_REPO,
    branch: process.env.TASK_POOL_REPO_BRANCH ?? DEFAULT_BRANCH,
    snapshotPath: process.env.TASK_POOL_SNAPSHOT_PATH ?? DEFAULT_SNAPSHOT_PATH,
    token: process.env.GITHUB_TOKEN,
  };
}

export function isTaskPoolRepositorySource() {
  return getConfig().source === 'task_pool_repo';
}

function toSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toDomainLabel(domain: string) {
  return domain
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeLabels(labels: Array<GitHubIssueLabel | string>) {
  return labels
    .map((label) => (typeof label === 'string' ? label : label.name ?? ''))
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);
}

function parseDueAtFromBody(body: string | null): Date | null {
  if (!body) return null;

  const candidates = [
    body.match(/(?:^|\n)\s*(?:due|deadline)\s*[:\-]\s*(\d{4}-\d{2}-\d{2})/i),
    body.match(/(?:^|\n)\s*(\d{4}-\d{2}-\d{2})\s*(?:due|deadline)/i),
  ];
  const rawDate = candidates.find(Boolean)?.[1];
  if (!rawDate) return null;

  const parsed = new Date(`${rawDate}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getDomain(labels: string[]) {
  const domainLabel = labels.find((label) => label.startsWith('domain:'));
  if (!domainLabel) return 'ops';
  const value = domainLabel.split(':')[1]?.trim();
  return value || 'ops';
}

function mapStatus(issue: GitHubIssue, labels: string[]) {
  if (issue.state === 'closed') return { status: TaskStatus.DONE, label: 'done' };
  if (labels.includes('status:blocked')) return { status: TaskStatus.BLOCKED, label: 'blocked' };
  if (labels.includes('status:active')) return { status: TaskStatus.IN_PROGRESS, label: 'active' };
  if (labels.includes('status:waiting')) return { status: TaskStatus.TODO, label: 'waiting' };
  return { status: TaskStatus.TODO, label: 'open' };
}

function mapPriority(labels: string[]) {
  if (labels.includes('priority:a+')) return { priority: TaskPriority.CRITICAL, label: 'A+' };
  if (labels.includes('priority:a')) return { priority: TaskPriority.HIGH, label: 'A' };
  if (labels.includes('priority:b')) return { priority: TaskPriority.MEDIUM, label: 'B' };
  if (labels.includes('priority:c')) return { priority: TaskPriority.LOW, label: 'C' };
  return { priority: TaskPriority.MEDIUM, label: 'B' };
}

function mapWorkflowType(issue: GitHubIssue, labels: string[]) {
  const title = issue.title.toLowerCase();
  if (title.includes('boomerang') || labels.includes('workflow:boomerang')) {
    return WorkflowType.BOOMERANG;
  }
  return WorkflowType.STANDARD;
}

function workflowIdFromDomain(domain: string) {
  return `tpw_${toSlug(domain)}`;
}

function toTaskPoolTask(issue: GitHubIssue): TaskPoolTask {
  const labels = normalizeLabels(issue.labels);
  const domain = getDomain(labels);
  const workflowId = workflowIdFromDomain(domain);
  const { status, label: statusLabel } = mapStatus(issue, labels);
  const { priority, label: priorityLabel } = mapPriority(labels);
  const workflowType = mapWorkflowType(issue, labels);

  const ownerName = issue.assignees?.[0]?.login ?? null;

  return {
    id: `tpt_${issue.number}`,
    title: issue.title,
    description: issue.body,
    status,
    priority,
    workflowId,
    ownerId: ownerName ? `gh:${ownerName}` : null,
    ownerName,
    dueAt: parseDueAtFromBody(issue.body),
    createdAt: new Date(issue.created_at),
    updatedAt: new Date(issue.updated_at),
    workflow: {
      id: workflowId,
      name: `${toDomainLabel(domain)} Task Pool`,
      type: workflowType,
      status: WorkflowStatus.ACTIVE,
    },
    owner: null,
    sourceChannel: 'task_pool_repo',
    sourceUrl: issue.html_url,
    statusLabel,
    priorityLabel,
    domain,
  };
}

async function fetchSnapshotFromRawUrl(): Promise<TaskPoolSnapshot | null> {
  const { owner, repo, branch, snapshotPath } = getConfig();
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${snapshotPath}`;
  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) {
      logTaskPoolEvent('warn', 'snapshot_raw_fetch_failed', { status: res.status, url });
      return null;
    }
    return (await res.json()) as TaskPoolSnapshot;
  } catch (error) {
    logTaskPoolEvent('error', 'snapshot_raw_fetch_error', { url, error: String(error) });
    return null;
  }
}

async function fetchSnapshotFromContentsApi(): Promise<TaskPoolSnapshot | null> {
  const { owner, repo, branch, snapshotPath, token } = getConfig();
  if (!token) return null;
  const encodedPath = snapshotPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      logTaskPoolEvent('warn', 'snapshot_contents_fetch_failed', { status: res.status, owner, repo, branch, snapshotPath });
      return null;
    }
    const payload = (await res.json()) as { content?: string; encoding?: string };
    if (!payload.content || payload.encoding !== 'base64') {
      logTaskPoolEvent('warn', 'snapshot_contents_invalid_payload', { owner, repo, branch, snapshotPath });
      return null;
    }
    const decoded = Buffer.from(payload.content, 'base64').toString('utf8');
    return JSON.parse(decoded) as TaskPoolSnapshot;
  } catch (error) {
    logTaskPoolEvent('error', 'snapshot_contents_fetch_error', { owner, repo, branch, snapshotPath, error: String(error) });
    return null;
  }
}

async function fetchIssuesFromGitHubApi(): Promise<GitHubIssue[] | null> {
  const { owner, repo, token } = getConfig();
  const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(url, { headers, next: { revalidate: 60 } });
    if (!res.ok) {
      logTaskPoolEvent('warn', 'issues_fetch_failed', { status: res.status, owner, repo });
      return null;
    }

    const issues = (await res.json()) as Array<GitHubIssue & { pull_request?: unknown }>;
    return issues.filter((issue) => !issue.pull_request);
  } catch (error) {
    logTaskPoolEvent('error', 'issues_fetch_error', { owner, repo, error: String(error) });
    return null;
  }
}

async function getTaskPoolIssues(): Promise<GitHubIssue[] | null> {
  const liveIssues = await fetchIssuesFromGitHubApi();
  if (liveIssues) return liveIssues;
  const snapshot = (await fetchSnapshotFromRawUrl()) ?? (await fetchSnapshotFromContentsApi());
  if (snapshot?.issues?.length) {
    logTaskPoolEvent('warn', 'using_snapshot_fallback', { issueCount: snapshot.issues.length });
  }
  return snapshot?.issues ?? null;
}

export async function listTaskPoolTasks(): Promise<TaskPoolTask[] | null> {
  const issues = await getTaskPoolIssues();
  if (!issues) return null;

  return issues
    .map(toTaskPoolTask)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function listTaskPoolWorkflows(): Promise<TaskPoolWorkflow[] | null> {
  const tasks = await listTaskPoolTasks();
  if (!tasks) return null;

  const grouped = new Map<string, TaskPoolWorkflow>();

  for (const task of tasks) {
    const existing = grouped.get(task.workflowId);
    if (!existing) {
      grouped.set(task.workflowId, {
        id: task.workflowId,
        name: task.workflow.name,
        description: `Live workflow projection from ${task.domain} tasks in the task-pool repository.`,
        type: task.workflow.type,
        status: task.status === TaskStatus.DONE ? WorkflowStatus.INACTIVE : WorkflowStatus.ACTIVE,
        submissions: [],
        runs: [],
        tasks: [task],
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      });
      continue;
    }

    existing.tasks.push(task);
    if (task.updatedAt > existing.updatedAt) existing.updatedAt = task.updatedAt;
    if (task.createdAt < existing.createdAt) existing.createdAt = task.createdAt;
    if (task.workflow.type === WorkflowType.BOOMERANG) existing.type = WorkflowType.BOOMERANG;
    if (task.status !== TaskStatus.DONE) existing.status = WorkflowStatus.ACTIVE;
  }

  return [...grouped.values()].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function getTaskPoolWorkflow(id: string): Promise<TaskPoolWorkflow | null> {
  const workflows = await listTaskPoolWorkflows();
  if (!workflows) return null;
  return workflows.find((workflow) => workflow.id === id) ?? null;
}

export async function listTaskPoolActivityEvents(limit = 50): Promise<TaskPoolActivityEvent[] | null> {
  const tasks = await listTaskPoolTasks();
  if (!tasks) return null;

  return tasks.slice(0, limit).map((task) => ({
    id: crypto.createHash('sha1').update(`${task.id}:${task.updatedAt.toISOString()}`).digest('hex'),
    entityType: 'task',
    entityId: task.id,
    eventType:
      task.status === TaskStatus.DONE
        ? 'completed'
        : task.status === TaskStatus.BLOCKED
          ? 'blocked'
          : 'updated',
    actorId: null,
    metadata: {
      title: task.title,
      domain: task.domain,
      priority: task.priorityLabel,
      url: task.sourceUrl,
    },
    createdAt: task.updatedAt,
  }));
}

/** Adds the `domain: vision board` label to an issue without removing existing labels. */
export async function addVisionBoardLabelToIssue(id: string): Promise<boolean> {
  const { owner, repo, token } = getConfig();
  if (!token) {
    logTaskPoolEvent('warn', 'add_vision_board_label_skipped', { reason: 'GITHUB_TOKEN not configured', id });
    return false;
  }

  const issueNumber = parseIssueNumber(id);
  if (!issueNumber) {
    logTaskPoolEvent('warn', 'add_vision_board_label_skipped', { reason: 'invalid task id', id });
    return false;
  }

  // Ensure the label exists in the repo first
  await ensureTaskPoolLabel(owner, repo, token, 'domain: vision board', '69f49d');

  // POST /issues/{number}/labels adds labels without overwriting existing ones
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ labels: ['domain: vision board'] }),
    }
  );

  if (!res.ok) {
    logTaskPoolEvent('warn', 'add_vision_board_label_failed', { issueNumber, status: res.status });
    return false;
  }

  logTaskPoolEvent('info', 'add_vision_board_label_success', { issueNumber });
  return true;
}

async function ensureTaskPoolLabel(owner: string, repo: string, token: string, name: string, color: string): Promise<void> {
  try {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/labels`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, color }),
    });
    // 201 = created, 422 = already exists — both are fine; ignore everything else silently
  } catch {
    // Non-fatal: label creation failure never blocks issue creation
  }
}

export async function createTaskPoolIssue(input: {
  title: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  workflowId?: string | null;
  extraLabels?: string[];
}): Promise<TaskPoolTask | null> {
  const { owner, repo, token } = getConfig();
  if (!token) {
    logTaskPoolEvent('warn', 'create_issue_skipped', { reason: 'GITHUB_TOKEN not configured' });
    return null;
  }

  const domain = input.workflowId?.startsWith('tpw_')
    ? input.workflowId.replace(/^tpw_/, '').replace(/-/g, '_')
    : 'ops';

  // Ensure the domain label exists in the repo before attaching it to an issue
  await ensureTaskPoolLabel(owner, repo, token, `domain:${domain}`, '0075ca');

  const priorityLabel =
    input.priority === TaskPriority.CRITICAL
      ? 'priority:A+'
      : input.priority === TaskPriority.HIGH
        ? 'priority:A'
        : input.priority === TaskPriority.LOW
          ? 'priority:C'
          : 'priority:B';

  const statusLabel =
    input.status === TaskStatus.BLOCKED
      ? 'status:blocked'
      : input.status === TaskStatus.IN_PROGRESS
        ? 'status:active'
        : 'status:waiting';

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: input.title,
      body: input.description ?? '',
      labels: [`domain:${domain}`, priorityLabel, statusLabel, ...(input.extraLabels ?? [])],
    }),
  });

  if (!response.ok) return null;
  const issue = (await response.json()) as GitHubIssue;
  return toTaskPoolTask(issue);
}

export async function closeTaskPoolIssueWithOutput(input: {
  issueNumber: number;
  output: string;
  agentId?: string | null;
  campaignId?: string | null;
}): Promise<boolean> {
  const { owner, repo, token } = getConfig();
  if (!token) {
    logTaskPoolEvent('warn', 'close_issue_skipped', { reason: 'GITHUB_TOKEN not configured' });
    return false;
  }

  const baseUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${input.issueNumber}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  // Fetch current body so we can append rather than overwrite
  const issueRes = await fetch(baseUrl, { headers, cache: 'no-store' });
  if (!issueRes.ok) return false;
  const issue = (await issueRes.json()) as GitHubIssue;

  const outputSection = [
    '',
    '---',
    '',
    '## Agent Output',
    `**Bot:** ${input.agentId ?? 'unknown'}`,
    `**Completed:** ${new Date().toISOString().split('T')[0]}`,
    '',
    '```',
    input.output.slice(0, 60_000), // guard against oversized payloads
    '```',
  ].join('\n');

  const newBody = `${issue.body ?? ''}${outputSection}`;

  // Append output + close in parallel
  const [bodyRes, stateRes] = await Promise.all([
    fetch(baseUrl, { method: 'PATCH', headers, body: JSON.stringify({ body: newBody }) }),
    fetch(baseUrl, { method: 'PATCH', headers, body: JSON.stringify({ state: 'closed' }) }),
  ]);

  return bodyRes.ok && stateRes.ok;
}

function statusToLabel(status: TaskStatus) {
  switch (status) {
    case TaskStatus.DONE:
      return 'status:done';
    case TaskStatus.BLOCKED:
      return 'status:blocked';
    case TaskStatus.IN_PROGRESS:
      return 'status:active';
    case TaskStatus.TODO:
    default:
      return 'status:waiting';
  }
}

function priorityToLabel(priority: TaskPriority) {
  switch (priority) {
    case TaskPriority.CRITICAL:
      return 'priority:A+';
    case TaskPriority.HIGH:
      return 'priority:A';
    case TaskPriority.LOW:
      return 'priority:C';
    case TaskPriority.MEDIUM:
    default:
      return 'priority:B';
  }
}

function parseIssueNumber(taskId: string) {
  if (!taskId.startsWith('tpt_')) return null;
  const parsed = Number.parseInt(taskId.replace('tpt_', ''), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function updateTaskPoolIssue(input: {
  id: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  ownerLogin?: string;
}): Promise<TaskPoolTask | null> {
  const { owner, repo, token } = getConfig();
  if (!token) {
    logTaskPoolEvent('warn', 'update_issue_skipped', { reason: 'GITHUB_TOKEN not configured', id: input.id });
    return null;
  }

  const issueNumber = parseIssueNumber(input.id);
  if (!issueNumber) return null;

  const issueRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });
  if (!issueRes.ok) return null;

  const issue = (await issueRes.json()) as GitHubIssue;
  const currentLabels = (issue.labels ?? [])
    .map((label) => (typeof label === 'string' ? label : label.name ?? ''))
    .filter(Boolean);

  const labelsWithoutStatusOrPriority = currentLabels.filter((label) => {
    const lower = label.toLowerCase();
    return !lower.startsWith('status:') && !lower.startsWith('priority:');
  });

  const nextStatus = input.status ?? mapStatus(issue, normalizeLabels(issue.labels)).status;
  const nextPriority = input.priority ?? mapPriority(normalizeLabels(issue.labels)).priority;

  const nextLabels = [...labelsWithoutStatusOrPriority, statusToLabel(nextStatus), priorityToLabel(nextPriority)];

  const labelRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ labels: nextLabels }),
  });
  if (!labelRes.ok) return null;

  if (nextStatus === TaskStatus.DONE && issue.state !== 'closed') {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state: 'closed' }),
    });
  } else if (nextStatus !== TaskStatus.DONE && issue.state === 'closed') {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state: 'open' }),
    });
  }

  if (input.ownerLogin) {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ assignees: [input.ownerLogin] }),
    });
  }

  const refreshedRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });
  if (!refreshedRes.ok) return null;

  return toTaskPoolTask((await refreshedRes.json()) as GitHubIssue);
}
