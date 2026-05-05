import { randomUUID } from 'node:crypto';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { dispatchCampaigns, dispatchTasks, projects } from '@/lib/db/schema';

export const DEFAULT_PROJECTS = [
  { title: 'Creative Projects',       description: 'Design, content, brand, and creative work', color: 'pink',     icon: 'palette',  sortOrder: 0, isDefault: true },
  { title: 'Robotic Projects',        description: 'Automation, bots, AI agents, and systems',  color: 'cyan',     icon: 'cpu',      sortOrder: 1, isDefault: true },
  { title: 'Fund Development',        description: 'Fundraising, grants, investor relations',    color: 'mint',     icon: 'trending', sortOrder: 2, isDefault: true },
  { title: 'Home Projects',           description: 'Personal home, errands, and life admin',     color: 'lemon',    icon: 'home',     sortOrder: 3, isDefault: true },
  { title: 'Things for Anthony',      description: 'Tasks, notes, and items for Anthony',        color: 'lavender', icon: 'user',     sortOrder: 4, isDefault: true },
];

export async function ensureDefaultProjects() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(projects);
  if (Number(count) > 0) return;
  await db.insert(projects).values(DEFAULT_PROJECTS.map((project) => ({ id: randomUUID(), ...project })));
}

export async function listProjects() {
  await ensureDefaultProjects();
  const projectRows = await db
    .select()
    .from(projects)
    .orderBy(asc(projects.sortOrder), asc(projects.createdAt));

  const projectIds = projectRows.map((p) => p.id);
  const campaignRows = projectIds.length
    ? await db
        .select({
          id: dispatchCampaigns.id,
          title: dispatchCampaigns.title,
          status: dispatchCampaigns.status,
          projectId: dispatchCampaigns.projectId,
        })
        .from(dispatchCampaigns)
        .where(inArray(dispatchCampaigns.projectId, projectIds))
    : [];

  const campaignIds = campaignRows.map((c) => c.id);
  const taskRows = campaignIds.length
    ? await db
        .select({
          id: dispatchTasks.id,
          status: dispatchTasks.status,
          campaignId: dispatchTasks.campaignId,
        })
        .from(dispatchTasks)
        .where(inArray(dispatchTasks.campaignId, campaignIds))
    : [];

  return projectRows.map((project) => ({
    ...project,
    campaigns: campaignRows
      .filter((c) => c.projectId === project.id)
      .map((campaign) => ({
        id: campaign.id,
        title: campaign.title,
        status: campaign.status,
        tasks: taskRows.filter((t) => t.campaignId === campaign.id).map((t) => ({ status: t.status })),
      })),
  }));
}

export async function createProject(input: { title: string; description?: string; color?: string; icon?: string }) {
  const [{ maxSortOrder }] = await db
    .select({ maxSortOrder: sql<number | null>`max(${projects.sortOrder})` })
    .from(projects);

  const [created] = await db
    .insert(projects)
    .values({
      id: randomUUID(),
      title: input.title,
      description: input.description,
      color: input.color ?? 'lavender',
      icon: input.icon ?? 'folder',
      sortOrder: (maxSortOrder ?? -1) + 1,
    })
    .returning();

  return created;
}

export async function updateProject(id: string, input: { title?: string; description?: string; color?: string; icon?: string; sortOrder?: number }) {
  const [updated] = await db
    .update(projects)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();

  return updated;
}

export async function assignCampaignToProject(campaignId: string, projectId: string | null) {
  const [updated] = await db
    .update(dispatchCampaigns)
    .set({ projectId, updatedAt: new Date() })
    .where(eq(dispatchCampaigns.id, campaignId))
    .returning();

  return updated;
}

export async function deleteProject(id: string) {
  await db.delete(projects).where(eq(projects.id, id));
  return { ok: true };
}

export async function classifyProjectForText(title: string, description: string, projectTitles: string[]): Promise<string | null> {
  const text = `${title} ${description}`.toLowerCase();
  const scores = projectTitles.map((pt) => {
    const ptLower = pt.toLowerCase();
    if (ptLower.includes('creative') && text.match(/design|content|brand|creative|art|visual|marketing|copy|write|video|photo|social/)) return { title: pt, score: 3 };
    if (ptLower.includes('robot') && text.match(/bot|agent|automat|script|deploy|build|ai|ml|system|code|api|integrat/)) return { title: pt, score: 3 };
    if (ptLower.includes('fund') && text.match(/fund|grant|invest|investor|pitch|raise|capital|financ|revenue|money|budget/)) return { title: pt, score: 3 };
    if (ptLower.includes('home') && text.match(/home|house|errand|personal|family|chore|repair|grocery|clean|move/)) return { title: pt, score: 3 };
    if (ptLower.includes('anthony') && text.match(/anthony|for you|for him|his/)) return { title: pt, score: 3 };
    return { title: pt, score: 0 };
  });
  const best = scores.sort((a, b) => b.score - a.score)[0];
  return best?.score > 0 ? best.title : null;
}
