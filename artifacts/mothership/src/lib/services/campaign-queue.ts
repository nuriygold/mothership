import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { DispatchCampaignStatus, DispatchTaskStatus } from '@/lib/db/enums';
import { dispatchCampaigns, dispatchTasks } from '@/lib/db/schema';

// Persistence authority: the campaign queue folder is the source of truth for
// queue documents. The Dispatch tables mirror it so the app can read from the
// existing API without changing client wiring.

const DEFAULT_CAMPAIGN_QUEUE_ROOT = path.join(os.homedir(), '.openclaw', 'workspace', 'campaign-queue');

type QueuedTask = {
  title: string;
  description?: string | null;
  completed: boolean;
};

type QueuedCampaignDoc = {
  id: string;
  title: string;
  description: string | null;
  owner: string | null;
  notes: string | null;
  status: typeof DispatchCampaignStatus[keyof typeof DispatchCampaignStatus];
  sourceFile: string;
  createdAt: Date;
  updatedAt: Date;
  tasks: QueuedTask[];
};

type SyncSummary = {
  root: string;
  scanned: number;
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ file: string; message: string }>;
};

function campaignQueueRoot() {
  const configured = process.env.OPENCLAW_CAMPAIGN_QUEUE_ROOT?.trim();
  return configured ? path.resolve(configured) : DEFAULT_CAMPAIGN_QUEUE_ROOT;
}

function queueCampaignId(sourceFile: string) {
  const hash = createHash('sha1').update(sourceFile).digest('hex').slice(0, 10);
  const slug = path
    .basename(sourceFile, path.extname(sourceFile))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return `queue-${slug || 'campaign'}-${hash}`;
}

function normalizeBlock(text: string | null | undefined) {
  return text?.trim() ? text.trim() : null;
}

function sectionBody(contents: string, heading: RegExp) {
  const lines = contents.split(/\r?\n/);
  const start = lines.findIndex((line) => heading.test(line.trim()));
  if (start === -1) return '';

  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,6}\s+/.test(lines[i].trim())) break;
    body.push(lines[i]);
  }
  return body.join('\n').trim();
}

function firstHeadingTitle(contents: string, fallback: string) {
  const match = contents.match(/^#\s+(?:Campaign:\s*)?(.+)$/m);
  return normalizeBlock(match?.[1]) ?? fallback;
}

function extractSectionValue(contents: string, label: string) {
  const match = contents.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?:\\n\\*\\*|\\n#{1,6}\\s+|\\n---|$)`, 'i'));
  return normalizeBlock(match?.[1]);
}

function extractLines(section: string) {
  return section
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseTaskLine(line: string): QueuedTask | null {
  const checkbox = line.match(/^[*-]\s+\[(x|X| )\]\s+(.+)$/);
  if (checkbox) {
    return {
      title: checkbox[2].trim(),
      completed: checkbox[1].toLowerCase() === 'x',
    };
  }

  const bullet = line.match(/^[*-]\s+(.+)$/);
  if (bullet) {
    return {
      title: bullet[1].trim(),
      completed: false,
    };
  }

  const numbered = line.match(/^\d+\.\s+(.+)$/);
  if (numbered) {
    return {
      title: numbered[1].trim(),
      completed: false,
    };
  }

  return null;
}

function parseTasks(contents: string): QueuedTask[] {
  const headings = [
    /^(?:#{2,3}\s+)?(Phases\/Tasks|Tasks|Key Tasks|Tasks\/Subtasks|Audit & Status)\s*$/i,
  ];

  for (const heading of headings) {
    const section = sectionBody(contents, heading);
    if (!section) continue;
    const tasks = extractLines(section)
      .map(parseTaskLine)
      .filter((task): task is QueuedTask => Boolean(task));
    if (tasks.length > 0) return tasks;
  }

  return [];
}

function parseCampaignDoc(filePath: string, contents: string): QueuedCampaignDoc | null {
  const title = firstHeadingTitle(contents, path.basename(filePath, path.extname(filePath)));
  if (!title || /^campaign queue system$/i.test(title)) return null;

  const objective =
    extractSectionValue(contents, 'Objective') ??
    sectionBody(contents, /^##\s+Objective$/i) ??
    null;

  const owner =
    extractSectionValue(contents, 'Owner') ??
    extractSectionValue(contents, 'Owner\(s\)') ??
    sectionBody(contents, /^##\s+Owner(?:\(s\))?$/i) ??
    null;

  const notes =
    sectionBody(contents, /^##\s+Status\/Notes$/i) ||
    sectionBody(contents, /^##\s+Notes$/i) ||
    sectionBody(contents, /^##\s+Audit & Status$/i) ||
    null;

  const tasks = parseTasks(contents);
  const sourceFile = filePath;
  const stats = fs.statSync(filePath);
  const createdAt = new Date(stats.birthtimeMs || stats.mtimeMs);
  const updatedAt = new Date(stats.mtimeMs);
  const allChecked = tasks.length > 0 && tasks.every((task) => task.completed);

  return {
    id: queueCampaignId(sourceFile),
    title,
    description: objective,
    owner,
    notes,
    status: allChecked ? DispatchCampaignStatus.READY : DispatchCampaignStatus.DRAFT,
    sourceFile,
    createdAt,
    updatedAt,
    tasks,
  };
}

function taskSignature(task: QueuedTask) {
  return [task.title, task.description ?? '', task.completed ? '1' : '0'].join('|');
}

function campaignSignature(campaign: {
  title: string;
  description: string | null;
  status: string;
  tasks: Array<{ title: string; description: string | null; status: string }>;
}) {
  return JSON.stringify({
    title: campaign.title,
    description: campaign.description,
    status: campaign.status,
    tasks: campaign.tasks.map((task) => [task.title, task.description, task.status]),
  });
}

async function writeCampaignDoc(doc: QueuedCampaignDoc): Promise<'imported' | 'updated' | 'skipped'> {
  const [existing] = await db
    .select()
    .from(dispatchCampaigns)
    .where(eq(dispatchCampaigns.id, doc.id))
    .limit(1);

  const nextTasks = doc.tasks.map((task, index) => ({
    id: `${doc.id}:task-${String(index + 1).padStart(2, '0')}:${createHash('sha1').update(taskSignature(task)).digest('hex').slice(0, 8)}`,
    campaignId: doc.id,
    title: task.title,
    key: `task-${index + 1}`,
    description: task.description ?? null,
    priority: 5,
    dependencies: [],
    toolRequirements: [],
    status: task.completed ? DispatchTaskStatus.DONE : DispatchTaskStatus.PLANNED,
    agentId: null,
    output: null,
    reviewOutput: null,
    errorMessage: null,
    toolTurns: null,
    taskPoolIssueNumber: null,
    taskPoolIssueUrl: null,
    startedAt: null,
    completedAt: task.completed ? doc.updatedAt : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }));

  const nextCampaign = {
    title: doc.title,
    description: [doc.description, doc.owner ? `Owner: ${doc.owner}` : null, doc.notes ? `Notes: ${doc.notes}` : null]
      .filter((part): part is string => Boolean(part))
      .join('\n\n')
      || null,
    status: doc.status,
    latestPlan: existing?.latestPlan ?? null,
    latestPlanCreatedAt: existing?.latestPlanCreatedAt ?? null,
    approvedPlanName: existing?.approvedPlanName ?? null,
    approvedPlanAt: existing?.approvedPlanAt ?? null,
    visionItemId: existing?.visionItemId ?? null,
    projectId: existing?.projectId ?? null,
    outputFolder: existing?.outputFolder ?? null,
    assignedBotId: existing?.assignedBotId ?? null,
    revenueStream: existing?.revenueStream ?? null,
    linkedTaskRef: existing?.linkedTaskRef ?? null,
    executionOwner: existing?.executionOwner ?? null,
    executionLeaseUntil: existing?.executionLeaseUntil ?? null,
    heartbeatAt: existing?.heartbeatAt ?? null,
    workerRunOwner: existing?.workerRunOwner ?? null,
    workerRunLeaseUntil: existing?.workerRunLeaseUntil ?? null,
    artifactsWrittenAt: existing?.artifactsWrittenAt ?? null,
    completionNotifiedAt: existing?.completionNotifiedAt ?? null,
    callbackDeliveredAt: existing?.callbackDeliveredAt ?? null,
    attemptCount: existing?.attemptCount ?? 0,
    queuedAt: existing?.queuedAt ?? doc.createdAt,
    scheduledAt: existing?.scheduledAt ?? null,
    createdAt: existing?.createdAt ?? doc.createdAt,
    updatedAt: doc.updatedAt,
  };

  const currentSignature = existing
    ? campaignSignature({
        title: existing.title,
        description: existing.description,
        status: existing.status,
        tasks: await db
          .select({ title: dispatchTasks.title, description: dispatchTasks.description, status: dispatchTasks.status })
          .from(dispatchTasks)
          .where(eq(dispatchTasks.campaignId, existing.id))
          .orderBy(asc(dispatchTasks.createdAt))
          .then((rows) => rows),
      })
    : null;

  const nextSignature = campaignSignature({
    title: nextCampaign.title,
    description: nextCampaign.description,
    status: nextCampaign.status,
    tasks: nextTasks.map((task) => ({
      title: task.title,
      description: task.description,
      status: task.status,
    })),
  });

  if (existing && currentSignature === nextSignature) {
    return 'skipped';
  }

  if (existing) {
    await db.update(dispatchCampaigns).set(nextCampaign).where(eq(dispatchCampaigns.id, doc.id));
    await db.delete(dispatchTasks).where(eq(dispatchTasks.campaignId, doc.id));
    if (nextTasks.length > 0) {
      await db.insert(dispatchTasks).values(nextTasks);
    }
    return 'updated';
  }

  await db.insert(dispatchCampaigns).values({
    id: doc.id,
    title: doc.title,
    description: nextCampaign.description,
    status: nextCampaign.status,
    latestPlan: null,
    latestPlanCreatedAt: null,
    approvedPlanName: null,
    approvedPlanAt: null,
    visionItemId: null,
    projectId: null,
    outputFolder: null,
    assignedBotId: null,
    revenueStream: null,
    linkedTaskRef: null,
    executionOwner: null,
    executionLeaseUntil: null,
    heartbeatAt: null,
    workerRunOwner: null,
    workerRunLeaseUntil: null,
    artifactsWrittenAt: null,
    completionNotifiedAt: null,
    callbackDeliveredAt: null,
    attemptCount: 0,
    queuedAt: doc.createdAt,
    scheduledAt: null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  });

  if (nextTasks.length > 0) {
    await db.insert(dispatchTasks).values(nextTasks);
  }
  return 'imported';
}

export async function syncCampaignQueueIntoDispatch(): Promise<SyncSummary> {
  const root = campaignQueueRoot();
  const summary: SyncSummary = {
    root,
    scanned: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    summary.errors.push({
      file: root,
      message: error instanceof Error ? error.message : String(error),
    });
    return summary;
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
    if (/^(readme|task-pool)\.md$/i.test(entry.name)) continue;

    const filePath = path.join(root, entry.name);
    summary.scanned += 1;
    try {
      const contents = fs.readFileSync(filePath, 'utf8');
      const doc = parseCampaignDoc(filePath, contents);
      if (!doc) {
        summary.skipped += 1;
        continue;
      }
      const result = await writeCampaignDoc(doc);
      if (result === 'imported') summary.imported += 1;
      if (result === 'updated') summary.updated += 1;
      if (result === 'skipped') summary.skipped += 1;
    } catch (error) {
      summary.errors.push({
        file: filePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}
