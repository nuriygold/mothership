import { prisma } from '@/lib/prisma';

export const DEFAULT_PROJECTS = [
  { title: 'Creative Projects',       description: 'Design, content, brand, and creative work', color: 'pink',     icon: 'palette',  sortOrder: 0, isDefault: true },
  { title: 'Robotic Projects',        description: 'Automation, bots, AI agents, and systems',  color: 'cyan',     icon: 'cpu',      sortOrder: 1, isDefault: true },
  { title: 'Fund Development',        description: 'Fundraising, grants, investor relations',    color: 'mint',     icon: 'trending', sortOrder: 2, isDefault: true },
  { title: 'Home Projects',           description: 'Personal home, errands, and life admin',     color: 'lemon',    icon: 'home',     sortOrder: 3, isDefault: true },
  { title: 'Things for Anthony',      description: 'Tasks, notes, and items for Anthony',        color: 'lavender', icon: 'user',     sortOrder: 4, isDefault: true },
];

export async function ensureDefaultProjects() {
  const count = await prisma.project.count();
  if (count === 0) {
    await prisma.project.createMany({ data: DEFAULT_PROJECTS });
  }
}

export async function listProjects() {
  await ensureDefaultProjects();
  return prisma.project.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: {
      campaigns: {
        select: { id: true, title: true, status: true, tasks: { select: { status: true } } },
      },
    },
  });
}

export async function createProject(input: { title: string; description?: string; color?: string; icon?: string }) {
  const maxOrder = await prisma.project.aggregate({ _max: { sortOrder: true } });
  return prisma.project.create({
    data: {
      title: input.title,
      description: input.description,
      color: input.color ?? 'lavender',
      icon: input.icon ?? 'folder',
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
    },
  });
}

export async function updateProject(id: string, input: { title?: string; description?: string; color?: string; icon?: string; sortOrder?: number }) {
  return prisma.project.update({ where: { id }, data: input });
}

export async function assignCampaignToProject(campaignId: string, projectId: string | null) {
  return prisma.dispatchCampaign.update({
    where: { id: campaignId },
    data: { projectId },
  });
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
