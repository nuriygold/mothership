/**
 * Vision Board mock data seed
 * Run from the branch root: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-vision.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Find the board (created automatically by the app on first visit)
  let board = await prisma.visionBoard.findFirst();
  if (!board) {
    board = await prisma.visionBoard.create({ data: { title: 'My Vision' } });
  }

  // Get seeded pillars
  const pillars = await prisma.visionPillar.findMany({
    where: { boardId: board.id },
    orderBy: { sortOrder: 'asc' },
  });

  if (pillars.length === 0) {
    console.log('No pillars found — visit /vision first to seed the default pillars, then re-run.');
    return;
  }

  const byLabel = Object.fromEntries(pillars.map((p) => [p.label, p]));

  // Check if already seeded
  const existing = await prisma.visionItem.count();
  if (existing > 0) {
    console.log(`Already have ${existing} vision items — skipping seed.`);
    return;
  }

  // ── Wealth ─────────────────────────────────────────────────────────────────
  if (byLabel['Wealth']) {
    await prisma.visionItem.createMany({
      data: [
        {
          pillarId: byLabel['Wealth'].id,
          title: 'Build a 12-month cash runway',
          description: 'Never be forced into a bad decision because of money pressure. Full optionality.',
          status: 'ACTIVE',
          imageEmoji: '🏦',
          targetDate: new Date('2026-12-31'),
          sortOrder: 0,
        },
        {
          pillarId: byLabel['Wealth'].id,
          title: 'Own income-producing real estate',
          description: 'First rental property cash-flowing $1,500/mo minimum. Proof of concept for the portfolio.',
          status: 'DREAMING',
          imageEmoji: '🏠',
          targetDate: new Date('2027-06-30'),
          sortOrder: 1,
        },
        {
          pillarId: byLabel['Wealth'].id,
          title: 'Investment portfolio at $250k',
          description: 'Diversified across index funds, growth equities, and alternatives.',
          status: 'ACTIVE',
          imageEmoji: '📈',
          targetDate: new Date('2027-01-01'),
          sortOrder: 2,
        },
      ],
    });
  }

  // ── Freedom ────────────────────────────────────────────────────────────────
  if (byLabel['Freedom']) {
    await prisma.visionItem.createMany({
      data: [
        {
          pillarId: byLabel['Freedom'].id,
          title: 'Fully location-independent income',
          description: 'All revenue streams work from anywhere. No office, no hard tether.',
          status: 'ACTIVE',
          imageEmoji: '🌍',
          sortOrder: 0,
        },
        {
          pillarId: byLabel['Freedom'].id,
          title: 'Work 30-hour weeks by design',
          description: 'Not burnout-forced rest — intentional high-leverage 30 hours with real afternoons free.',
          status: 'DREAMING',
          imageEmoji: '⏳',
          sortOrder: 1,
        },
      ],
    });
  }

  // ── Health ─────────────────────────────────────────────────────────────────
  if (byLabel['Health']) {
    await prisma.visionItem.createMany({
      data: [
        {
          pillarId: byLabel['Health'].id,
          title: 'Run a half marathon',
          description: 'Not about the race — about proving the body is strong and the discipline is there.',
          status: 'ACTIVE',
          imageEmoji: '🏃',
          targetDate: new Date('2026-10-01'),
          sortOrder: 0,
        },
        {
          pillarId: byLabel['Health'].id,
          title: 'Sleep avg 7.5h tracked by Oura',
          description: 'Consistency is the metric. 90-day rolling average.',
          status: 'ACHIEVED',
          imageEmoji: '😴',
          sortOrder: 1,
        },
      ],
    });
  }

  // ── Legacy ─────────────────────────────────────────────────────────────────
  if (byLabel['Legacy']) {
    await prisma.visionItem.createMany({
      data: [
        {
          pillarId: byLabel['Legacy'].id,
          title: 'Ship something used by 10,000 people',
          description: 'A product, tool, or piece of writing that meaningfully improves how people work or think.',
          status: 'DREAMING',
          imageEmoji: '🌱',
          sortOrder: 0,
        },
        {
          pillarId: byLabel['Legacy'].id,
          title: 'Document the Mothership system publicly',
          description: 'Open playbook for running a one-person operation with AI agents at the core.',
          status: 'DREAMING',
          imageEmoji: '📖',
          sortOrder: 1,
        },
      ],
    });
  }

  // ── Creative ───────────────────────────────────────────────────────────────
  if (byLabel['Creative']) {
    await prisma.visionItem.createMany({
      data: [
        {
          pillarId: byLabel['Creative'].id,
          title: 'Publish 50 essays',
          description: 'Long-form thinking on AI, autonomy, and building. One per week, compounding.',
          status: 'ACTIVE',
          imageEmoji: '✍️',
          sortOrder: 0,
        },
      ],
    });
  }

  // ── Business ───────────────────────────────────────────────────────────────
  if (byLabel['Business']) {
    await prisma.visionItem.createMany({
      data: [
        {
          pillarId: byLabel['Business'].id,
          title: 'Reach $30k MRR',
          description: 'Enough to feel the flywheel. Multiple streams, none over 50% of total.',
          status: 'ACTIVE',
          imageEmoji: '🚀',
          targetDate: new Date('2027-01-01'),
          sortOrder: 0,
        },
        {
          pillarId: byLabel['Business'].id,
          title: 'Launch Mothership as a product',
          description: 'Package the agent OS for other operators. Waitlist → private beta → public.',
          status: 'DREAMING',
          imageEmoji: '🛸',
          sortOrder: 1,
        },
        {
          pillarId: byLabel['Business'].id,
          title: 'First enterprise client',
          description: 'A company paying $5k+/mo for a custom agent deployment.',
          status: 'DREAMING',
          imageEmoji: '🏢',
          sortOrder: 2,
        },
      ],
    });
  }

  // ── Link a few items to existing finance plans ─────────────────────────────
  const plans = await prisma.financePlan.findMany({ take: 3 });
  const items = await prisma.visionItem.findMany({ take: 3 });

  for (let i = 0; i < Math.min(plans.length, items.length); i++) {
    await prisma.visionFinancePlanLink.upsert({
      where: { visionItemId_financePlanId: { visionItemId: items[i].id, financePlanId: plans[i].id } },
      create: { visionItemId: items[i].id, financePlanId: plans[i].id },
      update: {},
    });
    await prisma.visionItem.update({
      where: { id: items[i].id },
      data: { status: 'ACTIVE' },
    });
  }

  // ── Link a few items to existing campaigns ─────────────────────────────────
  const campaigns = await prisma.dispatchCampaign.findMany({ take: 2 });
  const activeItems = await prisma.visionItem.findMany({ where: { status: 'ACTIVE' }, take: 2 });

  for (let i = 0; i < Math.min(campaigns.length, activeItems.length); i++) {
    await prisma.visionCampaignLink.upsert({
      where: { visionItemId_campaignId: { visionItemId: activeItems[i].id, campaignId: campaigns[i].id } },
      create: { visionItemId: activeItems[i].id, campaignId: campaigns[i].id },
      update: {},
    });
    await prisma.dispatchCampaign.update({
      where: { id: campaigns[i].id },
      data: { visionItemId: activeItems[i].id },
    });
  }

  const total = await prisma.visionItem.count();
  console.log(`✓ Seeded ${total} vision items across ${pillars.length} pillars.`);
  console.log('✓ Linked available finance plans and campaigns where they exist.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
