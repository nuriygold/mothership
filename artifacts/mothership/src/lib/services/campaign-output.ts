import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { dispatchCampaigns, dispatchTasks } from '@/lib/db/schema';
import { sendTelegramMessage } from '@/lib/services/telegram';
import { dispatchToOpenClaw } from '@/lib/services/openclaw';

// Persistence authority: this filesystem store is a derivative export cache for
// campaign artifacts. DispatchCampaign and DispatchTask rows remain the source
// of truth for campaign state, task outputs, and recovery decisions.

const DEFAULT_DISPATCH_OUTPUT_ROOT = path.join(os.homedir(), 'openclaw', 'workspace-dispatch');
const DEFAULT_DISPATCH_WORKSPACE_ROOT = path.join(os.homedir(), 'openclaw', 'workspace');

export type CampaignOutputResult =
  | { ok: true; outputDir: string }
  | { ok: false; code: 'CAMPAIGN_NOT_FOUND' | 'MKDIR_FAILED' | 'WRITE_FAILED'; message: string };

export type ZipCampaignOutputResult =
  | { ok: true; buffer: Buffer }
  | { ok: false; code: 'ZIP_FAILED'; message: string };

export type CampaignOutputRetentionResult = {
  root: string;
  maxAgeDays: number;
  cutoffIso: string;
  removedDirectories: string[];
  removedZipFiles: string[];
  errors: Array<{ path: string; message: string }>;
};

function envPath(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? path.resolve(value) : fallback;
}

export function getDispatchOutputRoot(): string {
  return envPath('DISPATCH_OUTPUT_ROOT', DEFAULT_DISPATCH_OUTPUT_ROOT);
}

export function getDispatchWorkspaceRoot(): string {
  return envPath('DISPATCH_WORKSPACE_ROOT', DEFAULT_DISPATCH_WORKSPACE_ROOT);
}

export function getRevenueStreamsRoot(): string {
  return envPath('REVENUE_STREAMS_ROOT', path.join(getDispatchWorkspaceRoot(), 'revenue_streams'));
}

function campaignSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export function campaignOutputDirName(title: string, date: Date): string {
  const slug = campaignSlug(title);
  const d = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `${slug}_${d}`;
}

function taskFilename(index: number, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  return `${String(index + 1).padStart(2, '0')}-${slug}.md`;
}

function buildSummaryMd(campaign: {
  title: string;
  description?: string | null;
  status: string;
  tasks: Array<{ title: string; status: string }>;
}): string {
  const done = campaign.tasks.filter((t) => t.status === 'DONE').length;
  const failed = campaign.tasks.filter((t) => t.status === 'FAILED').length;
  const lines = [
    `# ${campaign.title}`,
    '',
    `**Status:** ${campaign.status}`,
    `**Tasks:** ${campaign.tasks.length} total · ${done} done · ${failed} failed`,
    campaign.description ? `\n**Objective:** ${campaign.description}` : null,
    '',
    '## Tasks',
    '',
    ...campaign.tasks.map((t) => {
      const icon = t.status === 'DONE' ? '✅' : t.status === 'FAILED' ? '❌' : '⏳';
      return `${icon} **${t.title}** (${t.status})`;
    }),
    '',
    `---`,
    `_Generated: ${new Date().toISOString()}_`,
  ].filter((l): l is string => l !== null);
  return lines.join('\n');
}

function buildTaskMd(task: {
  title: string;
  description?: string | null;
  status: string;
  agentId?: string | null;
  output?: string | null;
  reviewOutput?: string | null;
  errorMessage?: string | null;
}): string {
  const lines = [
    `# ${task.title}`,
    '',
    `**Status:** ${task.status}`,
    task.description ? `**Description:** ${task.description}` : null,
    task.agentId ? `**Agent:** ${task.agentId}` : null,
    '',
    '## Output',
    '',
    task.output ?? '_No output._',
    task.reviewOutput ? `\n## Review\n\n${task.reviewOutput}` : null,
    task.errorMessage ? `\n## Error\n\n\`\`\`\n${task.errorMessage}\n\`\`\`` : null,
  ].filter((l): l is string => l !== null);
  return lines.join('\n');
}

function atomicWriteText(filePath: string, contents: string) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(tempPath, contents, 'utf8');
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.rmSync(tempPath, { force: true });
    }
  }
}

function buildWriteFailed(message: string): CampaignOutputResult {
  return { ok: false, code: 'WRITE_FAILED', message };
}

export async function writeCampaignOutput(campaignId: string): Promise<CampaignOutputResult> {
  const [campaign] = await db
    .select()
    .from(dispatchCampaigns)
    .where(eq(dispatchCampaigns.id, campaignId))
    .limit(1);
  if (!campaign) {
    return {
      ok: false,
      code: 'CAMPAIGN_NOT_FOUND',
      message: `Campaign ${campaignId} was not found while writing export output.`,
    };
  }

  const tasks = await db
    .select()
    .from(dispatchTasks)
    .where(eq(dispatchTasks.campaignId, campaignId))
    .orderBy(asc(dispatchTasks.priority), asc(dispatchTasks.createdAt));

  const campaignWithTasks = { ...campaign, tasks };

  const dirName = campaignOutputDirName(campaignWithTasks.title, campaignWithTasks.createdAt);
  const outputDir = path.join(getDispatchOutputRoot(), dirName);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: 'MKDIR_FAILED',
      message: `Failed to create campaign output directory ${outputDir}: ${message}`,
    };
  }

  try {
    atomicWriteText(path.join(outputDir, 'summary.md'), buildSummaryMd(campaignWithTasks));

    for (let i = 0; i < campaignWithTasks.tasks.length; i++) {
      const task = campaignWithTasks.tasks[i];
      atomicWriteText(path.join(outputDir, taskFilename(i, task.title)), buildTaskMd(task));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return buildWriteFailed(`Failed to write campaign output files in ${outputDir}: ${message}`);
  }

  if (campaignWithTasks.outputFolder && campaignWithTasks.assignedBotId) {
    const fileContents = campaignWithTasks.tasks
      .map((t, i) => `### ${taskFilename(i, t.title)}\n\n${t.output ?? '_No output._'}`)
      .join('\n\n---\n\n');
    const prompt = [
      `Campaign complete: **${campaignWithTasks.title}**`,
      ``,
      `Please write the following campaign output files to: \`${campaignWithTasks.outputFolder}\``,
      ``,
      `**summary.md**`,
      buildSummaryMd(campaignWithTasks),
      ``,
      `---`,
      ``,
      fileContents,
    ].join('\n');

    dispatchToOpenClaw({
      text: prompt,
      agentId: campaignWithTasks.assignedBotId,
      sessionKey: `campaign-output:${campaignId}`,
    }).catch(() => {
      // Non-fatal: filesystem export already succeeded locally.
    });
  }

  return { ok: true, outputDir };
}

export async function pingTelegramCampaignComplete(campaign: {
  id: string;
  title: string;
  status: string;
  tasks: Array<{ status: string }>;
  appUrl?: string;
}): Promise<void> {
  const done = campaign.tasks.filter((t) => t.status === 'DONE').length;
  const failed = campaign.tasks.filter((t) => t.status === 'FAILED').length;
  const total = campaign.tasks.length;
  const appUrl = campaign.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? '';
  const link = appUrl ? `${appUrl}/dispatch` : '/dispatch';

  const text = [
    `🏆 *Campaign complete:* ${campaign.title}`,
    ``,
    `✅ ${done}/${total} tasks done${failed ? ` · ❌ ${failed} failed` : ''}`,
    ``,
    `[Open in Dispatch](${link})`,
  ].join('\n');

  await sendTelegramMessage({ text }).catch(() => {
    // Non-fatal notification path.
  });
}

export async function getCampaignOutputDir(campaignId: string): Promise<string | null> {
  const [campaign] = await db
    .select({ title: dispatchCampaigns.title, createdAt: dispatchCampaigns.createdAt })
    .from(dispatchCampaigns)
    .where(eq(dispatchCampaigns.id, campaignId))
    .limit(1);
  if (!campaign) return null;
  const dirName = campaignOutputDirName(campaign.title, campaign.createdAt);
  const dir = path.join(getDispatchOutputRoot(), dirName);
  return fs.existsSync(dir) ? dir : null;
}

export function zipCampaignOutputDir(dir: string): ZipCampaignOutputResult {
  const zipPath = `${dir}.zip`;
  try {
    execFileSync('zip', ['-r', zipPath, path.basename(dir)], {
      cwd: path.dirname(dir),
      stdio: 'pipe',
    });
    const buffer = fs.readFileSync(zipPath);
    fs.unlinkSync(zipPath);
    return { ok: true, buffer };
  } catch (error) {
    try {
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    } catch {
      // Best-effort cleanup for the temporary archive.
    }
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: 'ZIP_FAILED',
      message: `Failed to create zip archive for ${dir}: ${message}`,
    };
  }
}

export function listOutputFolders(): string[] {
  const workspaceRoot = getDispatchWorkspaceRoot();
  const revenueBase = getRevenueStreamsRoot();
  const results: string[] = [];

  const readSubdirs = (dir: string) => {
    try {
      return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(dir, e.name));
    } catch {
      return [];
    }
  };

  results.push(...readSubdirs(revenueBase));

  const topLevel = readSubdirs(workspaceRoot).filter((d) => d !== revenueBase);
  results.push(...topLevel);

  const hardcoded = [
    path.join(revenueBase, 'Shopify'),
    path.join(revenueBase, 'NuriyProduct'),
    path.join(revenueBase, 'TikTok'),
    path.join(revenueBase, 'Notary'),
    path.join(revenueBase, 'Truckstop'),
    path.join(workspaceRoot, 'projects'),
    path.join(workspaceRoot, 'shared'),
  ];
  for (const p of hardcoded) {
    if (!results.includes(p)) results.push(p);
  }

  return results;
}

export function pruneCampaignOutputArtifacts(options?: { maxAgeDays?: number }): CampaignOutputRetentionResult {
  const maxAgeDays = options?.maxAgeDays ?? 30;
  const root = getDispatchOutputRoot();
  const cutoffMs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const removedDirectories: string[] = [];
  const removedZipFiles: string[] = [];
  const errors: Array<{ path: string; message: string }> = [];

  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({ path: root, message });
    return {
      root,
      maxAgeDays,
      cutoffIso: new Date(cutoffMs).toISOString(),
      removedDirectories,
      removedZipFiles,
      errors,
    };
  }

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    try {
      const stats = fs.statSync(entryPath);
      if (stats.mtimeMs >= cutoffMs) continue;

      if (entry.isDirectory()) {
        fs.rmSync(entryPath, { recursive: true, force: true });
        removedDirectories.push(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.zip')) {
        const baseDir = entryPath.slice(0, -4);
        if (!fs.existsSync(baseDir)) {
          fs.rmSync(entryPath, { force: true });
          removedZipFiles.push(entryPath);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ path: entryPath, message });
    }
  }

  return {
    root,
    maxAgeDays,
    cutoffIso: new Date(cutoffMs).toISOString(),
    removedDirectories,
    removedZipFiles,
    errors,
  };
}
