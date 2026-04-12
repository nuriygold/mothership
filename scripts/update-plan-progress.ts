/**
 * Update Finance Plan Progress
 *
 * Finds a finance plan by title and updates its currentValue.
 * Optionally updates status (ACTIVE, PAUSED, COMPLETED, ARCHIVED).
 *
 * Usage:
 *   npm run finance:update-plan -- --title "Storage Unit Liquidation" --currentValue 450
 *   npm run finance:update-plan -- --title "Storage Unit Liquidation" --currentValue 1000 --status COMPLETED
 */

import fs from 'fs';
import path from 'path';

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

import { PrismaClient } from '@prisma/client';

type PlanStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
const VALID_STATUSES: PlanStatus[] = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'];

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  let title = '';
  let currentValue: number | null = null;
  let status: PlanStatus | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--title' && args[i + 1]) title = args[++i];
    if (args[i] === '--currentValue' && args[i + 1]) currentValue = parseFloat(args[++i]);
    if (args[i] === '--status' && args[i + 1]) {
      const raw = args[++i].toUpperCase() as PlanStatus;
      if (VALID_STATUSES.includes(raw)) status = raw;
      else {
        console.error(`Error: --status must be one of ${VALID_STATUSES.join(', ')}`);
        process.exit(1);
      }
    }
  }

  return { title, currentValue, status };
}

async function main() {
  const { title, currentValue, status } = parseArgs();

  if (!title) {
    console.error('Error: --title is required');
    process.exit(1);
  }
  if (currentValue === null || isNaN(currentValue)) {
    console.error('Error: --currentValue is required and must be a number');
    process.exit(1);
  }

  const plan = await prisma.financePlan.findFirst({ where: { title } });
  if (!plan) {
    console.error(`Error: No finance plan found with title "${title}"`);
    process.exit(1);
  }

  const updated = await prisma.financePlan.update({
    where: { id: plan.id },
    data: {
      currentValue,
      ...(status ? { status } : {}),
    },
  });

  const pct = updated.targetValue
    ? ((updated.currentValue ?? 0) / updated.targetValue * 100).toFixed(1)
    : null;

  console.log(
    `[update-plan] "${updated.title}" → ${updated.currentValue} / ${updated.targetValue} ${updated.unit ?? ''}${pct ? ` (${pct}%)` : ''}${status ? ` [${updated.status}]` : ''}`
  );
}

main()
  .catch((err) => {
    console.error('[update-plan] Fatal error:', err);
    prisma.$disconnect().finally(() => process.exit(1));
  })
  .finally(() => prisma.$disconnect());
