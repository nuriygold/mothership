/**
 * Vision Board mock data seed
 * Run from the branch root: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-vision.ts
 */
/**
 * Vision Board mock data seed
 * Run from the branch root: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-vision.ts
 */
import fs from 'fs';
import path from 'path';

// Load .env before Drizzle initialises
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { db } from '../lib/db/client';
import * as schema from '../lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { getOrCreateVisionBoard, createVisionItem, linkFinancePlanToItem, linkCampaignToItem } from '../lib/services/vision';
import { VisionItemStatus } from '../lib/db/enums';

async function main() {
  const board = await getOrCreateVisionBoard();
  const pillars = await db.query.visionPillars.findMany({
    where: eq(schema.visionPillars.boardId, board.id),
    orderBy: (pillars, { asc }) => [asc(pillars.sortOrder)],
  });

  if (pillars.length === 0) {
    console.log('No pillars found. They should have been created by getOrCreateVisionBoard.');
    return;
  }

  const byLabel = Object.fromEntries(pillars.map((p) => [p.label, p]));

  // Check if already seeded
  const existingResult = await db.select({ count: sql<number>`count(*)` }).from(schema.visionItems);
  const existing = existingResult[0].count;
  if (existing > 0) {
    console.log(`Already have ${existing} vision items — skipping seed.`);
    return;
  }

  // ── Wealth ─────────────────────────────────────────────────────────────────
  if (byLabel['Wealth']) {
    const items = [
      {
        title: 'Build a 12-month cash runway',
        description: 'Never be forced into a bad decision because of money pressure. Full optionality.',
        status: VisionItemStatus.ACTIVE,
        imageEmoji: '🏦',
        targetDate: '2026-12-31',
        sortOrder: 0,
      },
      {
        title: 'Own income-producing real estate',
        description: 'First rental property cash-flowing $1,500/mo minimum. Proof of concept for the portfolio.',
        status: VisionItemStatus.DREAMING,
        imageEmoji: '🏠',
        targetDate: '2027-06-30',
        sortOrder: 1,
      },
      {
        title: 'Investment portfolio at $250k',
        description: 'Diversified across index funds, growth equities, and alternatives.',
        status: VisionItemStatus.ACTIVE,
        imageEmoji: '📈',
        targetDate: '2027-01-01',
        sortOrder: 2,
      },
    ];
    for (const item of items) {
      await createVisionItem(byLabel['Wealth'].id, item);
    }
  }

  // ── Freedom ────────────────────────────────────────────────────────────────
  if (byLabel['Freedom']) {
    const items = [
      {
        title: 'Fully location-independent income',
        description: 'All revenue streams work from anywhere. No office, no hard tether.',
        status: VisionItemStatus.ACTIVE,
        imageEmoji: '🌍',
        sortOrder: 0,
      },
      {
        title: 'Work 30-hour weeks by design',
        description: 'Not burnout-forced rest — intentional high-leverage 30 hours with real afternoons free.',
        status: VisionItemStatus.DREAMING,
        imageEmoji: '⏳',
        sortOrder: 1,
      },
    ];
    for (const item of items) {
      await createVisionItem(byLabel['Freedom'].id, item);
    }
  }

  // ── Health ─────────────────────────────────────────────────────────────────
  if (byLabel['Health']) {
    const items = [
      {
        title: 'Run a half marathon',
        description: 'Not about the race — about proving the body is strong and the discipline is there.',
        status: VisionItemStatus.ACTIVE,
        imageEmoji: '🏃',
        targetDate: '2026-10-01',
        sortOrder: 0,
      },
      {
        title: 'Sleep avg 7.5h tracked by Oura',
        description: 'Consistency is the metric. 90-day rolling average.',
        status: VisionItemStatus.ACHIEVED,
        imageEmoji: '😴',
        sortOrder: 1,
      },
    ];
    for (const item of items) {
      await createVisionItem(byLabel['Health'].id, item);
    }
  }

  // ── Legacy ─────────────────────────────────────────────────────────────────
  if (byLabel['Legacy']) {
    const items = [
      {
        title: 'Ship something used by 10,000 people',
        description: 'A product, tool, or piece of writing that meaningfully improves how people work or think.',
        status: VisionItemStatus.DREAMING,
        imageEmoji: '🌱',
        sortOrder: 0,
      },
      {
        title: 'Document the Mothership system publicly',
        description: 'Open playbook for running a one-person operation with AI agents at the core.',
        status: VisionItemStatus.DREAMING,
        imageEmoji: '📖',
        sortOrder: 1,
      },
    ];
    for (const item of items) {
      await createVisionItem(byLabel['Legacy'].id, item);
    }
  }

  // ── Creative ───────────────────────────────────────────────────────────────
  if (byLabel['Creative']) {
    const items = [
      {
        title: 'Publish 50 essays',
        description: 'Long-form thinking on AI, autonomy, and building. One per week, compounding.',
        status: VisionItemStatus.ACTIVE,
        imageEmoji: '✍️',
        sortOrder: 0,
      },
    ];
    for (const item of items) {
      await createVisionItem(byLabel['Creative'].id, item);
    }
  }

  // ── Business ───────────────────────────────────────────────────────────────
  if (byLabel['Business']) {
    const items = [
      {
        title: 'Reach $30k MRR',
        description: 'Enough to feel the flywheel. Multiple streams, none over 50% of total.',
        status: VisionItemStatus.ACTIVE,
        imageEmoji: '🚀',
        targetDate: '2027-01-01',
        sortOrder: 0,
      },
      {
        title: 'Launch Mothership as a product',
        description: 'Package the agent OS for other operators. Waitlist → private beta → public.',
        status: VisionItemStatus.DREAMING,
        imageEmoji: '🛸',
        sortOrder: 1,
      },
      {
        title: 'First enterprise client',
        description: 'A company paying $5k+/mo for a custom agent deployment.',
        status: VisionItemStatus.DREAMING,
        imageEmoji: '🏢',
        sortOrder: 2,
      },
    ];
    for (const item of items) {
      await createVisionItem(byLabel['Business'].id, item);
    }
  }

  // ── Link a few items to existing finance plans ─────────────────────────────
  const plans = await db.query.financePlans.findMany({ limit: 3 });
  const itemsCreated = await db.query.visionItems.findMany({ limit: 3 });

  for (let i = 0; i < Math.min(plans.length, itemsCreated.length); i++) {
    await linkFinancePlanToItem(itemsCreated[i].id, plans[i].id);
  }

  // ── Link a few items to existing campaigns ─────────────────────────────────
  const campaigns = await db.query.dispatchCampaigns.findMany({ limit: 2 });
  const activeItems = await db.query.visionItems.findMany({
    where: eq(schema.visionItems.status, VisionItemStatus.ACTIVE),
    limit: 2,
  });

  for (let i = 0; i < Math.min(campaigns.length, activeItems.length); i++) {
    await linkCampaignToItem(activeItems[i].id, campaigns[i].id);
  }

  const finalCountResult = await db.select({ count: sql<number>`count(*)` }).from(schema.visionItems);
  console.log(`✓ Seeded ${finalCountResult[0].count} vision items across ${pillars.length} pillars.`);
  console.log('✓ Linked available finance plans and campaigns where they exist.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); });
