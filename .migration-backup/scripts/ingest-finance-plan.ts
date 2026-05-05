/**
 * Finance Plan Ingestion Script
 *
 * Reads a JSON plan file (or an entire plans/finance/ directory) and upserts
 * the plan(s) into the database. Safe to re-run — identified by sourceFile path,
 * so committing an updated plan file and re-running this script updates the record.
 *
 * Usage:
 *   # Ingest a single plan file:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/ingest-finance-plan.ts plans/finance/credit-score-plan.json
 *
 *   # Ingest all plans in the default directory:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/ingest-finance-plan.ts
 *
 * Or via npm:
 *   npm run finance:ingest -- plans/finance/credit-score-plan.json
 *   npm run finance:ingest
 */

import fs from 'fs';
import path from 'path';

// Load .env from project root before Drizzle initialises
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

import { db } from '../lib/db/client';
import * as schema from '../lib/db/schema';
import { eq } from 'drizzle-orm';
import { FinancePlanStatus, FinancePlanType } from '../lib/db/enums';
import crypto from 'crypto';

interface PlanFile {
  title: string;
  type?: string;
  status?: string;
  description?: string;
  goal?: string;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  startDate?: string;
  targetDate?: string;
  managedByBot?: string;
  milestones?: Array<{ label: string; targetValue?: number; completedAt?: string }>;
  notes?: string;
}

function resolvePlanType(type?: string): FinancePlanType {
  if (type && Object.values(FinancePlanType).includes(type.toUpperCase() as FinancePlanType)) {
    return type.toUpperCase() as FinancePlanType;
  }
  return FinancePlanType.CUSTOM;
}

function resolvePlanStatus(status?: string): FinancePlanStatus {
  if (status && Object.values(FinancePlanStatus).includes(status.toUpperCase() as FinancePlanStatus)) {
    return status.toUpperCase() as FinancePlanStatus;
  }
  return FinancePlanStatus.ACTIVE;
}

async function ingestFile(filePath: string): Promise<void> {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`[ingest] File not found: ${absolutePath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(absolutePath, 'utf-8');
  let data: PlanFile;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error(`[ingest] Invalid JSON in ${filePath}`);
    process.exit(1);
  }

  if (!data.title) {
    console.error(`[ingest] Plan file missing required field "title": ${filePath}`);
    process.exit(1);
  }

  // Relative path stored as sourceFile for idempotency
  const sourceFile = path.relative(process.cwd(), absolutePath);

  const existing = await db.query.financePlans.findFirst({
    where: eq(schema.financePlans.sourceFile, sourceFile),
  });

  if (existing) {
    await db.update(schema.financePlans)
      .set({
        title: data.title,
        type: resolvePlanType(data.type),
        status: resolvePlanStatus(data.status),
        description: data.description ?? null,
        goal: data.goal ?? null,
        currentValue: data.currentValue ?? null,
        targetValue: data.targetValue ?? null,
        unit: data.unit ?? null,
        startDate: data.startDate ? new Date(data.startDate) : null,
        targetDate: data.targetDate ? new Date(data.targetDate) : null,
        managedByBot: data.managedByBot ?? 'emerald',
        milestones: data.milestones ?? [],
        notes: data.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.financePlans.id, existing.id));
    console.log(`[ingest] Updated plan: "${data.title}" (${sourceFile})`);
  } else {
    await db.insert(schema.financePlans).values({
      id: crypto.randomUUID(),
      title: data.title,
      type: resolvePlanType(data.type),
      status: resolvePlanStatus(data.status),
      description: data.description ?? null,
      goal: data.goal ?? null,
      currentValue: data.currentValue ?? null,
      targetValue: data.targetValue ?? null,
      unit: data.unit ?? null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      targetDate: data.targetDate ? new Date(data.targetDate) : null,
      managedByBot: data.managedByBot ?? 'emerald',
      milestones: data.milestones ?? [],
      notes: data.notes ?? null,
      sourceFile,
      updatedAt: new Date(),
    });
    console.log(`[ingest] Created plan: "${data.title}" (${sourceFile})`);
  }
}

async function main() {
  const arg = process.argv[2];
  const defaultDir = path.join(process.cwd(), 'plans', 'finance');

  if (arg) {
    // Single file mode
    await ingestFile(arg);
  } else {
    // Directory mode — ingest all .json files in plans/finance/
    if (!fs.existsSync(defaultDir)) {
      console.error(`[ingest] No argument provided and default directory not found: ${defaultDir}`);
      console.error('Usage: npm run finance:ingest -- <path/to/plan.json>');
      process.exit(1);
    }
    const files = fs.readdirSync(defaultDir).filter((f) => f.endsWith('.json'));
    if (files.length === 0) {
      console.log(`[ingest] No JSON files found in ${defaultDir}`);
      process.exit(0);
    }
    for (const file of files) {
      await ingestFile(path.join(defaultDir, file));
    }
  }

  console.log('[ingest] Done.');
}

main().catch((err) => {
  console.error('[ingest] Fatal error:', err);
  process.exit(1);
});
