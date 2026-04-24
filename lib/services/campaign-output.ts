import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';
import { sendTelegramMessage } from '@/lib/services/telegram';
import { dispatchToOpenClaw } from '@/lib/services/openclaw';

const WORKSPACE_DISPATCH = path.join(os.homedir(), 'openclaw', 'workspace-dispatch');

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

export async function writeCampaignOutput(campaignId: string): Promise<string | null> {
  const campaign = await prisma.dispatchCampaign.findUnique({
    where: { id: campaignId },
    include: { tasks: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] } },
  });
  if (!campaign) return null;

  const dirName = campaignOutputDirName(campaign.title, campaign.createdAt);
  const outputDir = path.join(WORKSPACE_DISPATCH, dirName);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
  } catch {
    return null;
  }

  fs.writeFileSync(path.join(outputDir, 'summary.md'), buildSummaryMd(campaign));

  for (let i = 0; i < campaign.tasks.length; i++) {
    const task = campaign.tasks[i];
    fs.writeFileSync(path.join(outputDir, taskFilename(i, task.title)), buildTaskMd(task));
  }

  // If outputFolder + assignedBotId are set, dispatch a write-files job to that bot
  if (campaign.outputFolder && campaign.assignedBotId) {
    const fileContents = campaign.tasks
      .map((t, i) => `### ${taskFilename(i, t.title)}\n\n${t.output ?? '_No output._'}`)
      .join('\n\n---\n\n');
    const prompt = [
      `Campaign complete: **${campaign.title}**`,
      ``,
      `Please write the following campaign output files to: \`${campaign.outputFolder}\``,
      ``,
      `**summary.md**`,
      buildSummaryMd(campaign),
      ``,
      `---`,
      ``,
      fileContents,
    ].join('\n');

    dispatchToOpenClaw({
      text: prompt,
      agentId: campaign.assignedBotId,
      sessionKey: `campaign-output:${campaignId}`,
    }).catch(() => { /* non-fatal */ });
  }

  return outputDir;
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

  await sendTelegramMessage({ text }).catch(() => { /* non-fatal */ });
}

export async function getCampaignOutputDir(campaignId: string): Promise<string | null> {
  const campaign = await prisma.dispatchCampaign.findUnique({
    where: { id: campaignId },
    select: { title: true, createdAt: true },
  });
  if (!campaign) return null;
  const dirName = campaignOutputDirName(campaign.title, campaign.createdAt);
  const dir = path.join(WORKSPACE_DISPATCH, dirName);
  return fs.existsSync(dir) ? dir : null;
}

export function zipCampaignOutputDir(dir: string): Buffer | null {
  try {
    const zipPath = `${dir}.zip`;
    execSync(`zip -r "${zipPath}" "${dir}"`, { stdio: 'pipe' });
    const buf = fs.readFileSync(zipPath);
    fs.unlinkSync(zipPath);
    return buf;
  } catch {
    return null;
  }
}

export function listOutputFolders(): string[] {
  const base = path.join(os.homedir(), 'openclaw', 'workspace');
  const revenueBase = path.join(base, 'revenue_streams');
  const results: string[] = [];

  const readSubdirs = (dir: string) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => path.join(dir, e.name));
    } catch {
      return [];
    }
  };

  // ~/openclaw/workspace/revenue_streams/* subfolders
  results.push(...readSubdirs(revenueBase));

  // ~/openclaw/workspace/* top-level dirs (excluding revenue_streams itself)
  const topLevel = readSubdirs(base).filter((d) => d !== revenueBase);
  results.push(...topLevel);

  // A few common fallbacks if the paths don't exist yet
  const hardcoded = [
    path.join(revenueBase, 'Shopify'),
    path.join(revenueBase, 'NuriyProduct'),
    path.join(revenueBase, 'TikTok'),
    path.join(revenueBase, 'Notary'),
    path.join(revenueBase, 'Truckstop'),
    path.join(base, 'projects'),
    path.join(base, 'shared'),
  ];
  for (const p of hardcoded) {
    if (!results.includes(p)) results.push(p);
  }

  return results;
}
