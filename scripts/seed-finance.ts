/**
 * Finance Seed Script
 *
 * Seeds real financial data into the database:
 *   - 12 Accounts  (checking, savings, investment, credit)
 *   -  4 Payables  (mortgage, storage, contractors)
 *   -  3 FinancePlans
 *
 * All operations use upsert logic — safe to re-run.
 *   Accounts  matched by: name
 *   Payables  matched by: vendor
 *   Plans     matched by: title
 *
 * Usage:
 *   npm run finance:seed
 */

import fs from 'fs';
import path from 'path';

// Load .env before Prisma initialises
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

import { PrismaClient, FinancePlanType, FinancePlanStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertAccount(data: {
  name: string;
  type: string;
  balance: number;
  currency?: string;
}) {
  const existing = await prisma.account.findFirst({ where: { name: data.name } });
  if (existing) {
    const updated = await prisma.account.update({
      where: { id: existing.id },
      data: { type: data.type, balance: data.balance },
    });
    console.log(`  [account] updated  "${data.name}" → $${data.balance}`);
    return updated;
  }
  const created = await prisma.account.create({
    data: {
      name: data.name,
      type: data.type,
      balance: data.balance,
      currency: data.currency ?? 'USD',
    },
  });
  console.log(`  [account] created  "${data.name}" → $${data.balance}`);
  return created;
}

async function upsertPayable(data: {
  vendor: string;
  amount: number;
  dueDate?: Date | null;
  description?: string;
  status?: string;
}) {
  const existing = await prisma.payable.findFirst({ where: { vendor: data.vendor } });
  if (existing) {
    const updated = await prisma.payable.update({
      where: { id: existing.id },
      data: {
        amount: data.amount,
        dueDate: data.dueDate ?? null,
        description: data.description ?? null,
        status: data.status ?? existing.status,
      },
    });
    console.log(`  [payable] updated  "${data.vendor}" → $${data.amount}`);
    return updated;
  }
  const created = await prisma.payable.create({
    data: {
      vendor: data.vendor,
      amount: data.amount,
      dueDate: data.dueDate ?? null,
      description: data.description ?? null,
      status: data.status ?? 'pending',
    },
  });
  console.log(`  [payable] created  "${data.vendor}" → $${data.amount}`);
  return created;
}

async function upsertPlan(data: {
  title: string;
  type: FinancePlanType;
  status: FinancePlanStatus;
  goal?: string;
  currentValue?: number;
  targetValue?: number;
  unit?: string;
  startDate?: Date;
  targetDate?: Date;
  managedByBot?: string;
  milestones?: Array<{ label: string; targetValue?: number; completedAt?: string }>;
  notes?: string;
}) {
  const existing = await prisma.financePlan.findFirst({ where: { title: data.title } });
  if (existing) {
    const updated = await prisma.financePlan.update({
      where: { id: existing.id },
      data: {
        type: data.type,
        status: data.status,
        goal: data.goal ?? null,
        currentValue: data.currentValue ?? null,
        targetValue: data.targetValue ?? null,
        unit: data.unit ?? null,
        startDate: data.startDate ?? null,
        targetDate: data.targetDate ?? null,
        managedByBot: data.managedByBot ?? 'emerald',
        milestones: data.milestones ?? [],
        notes: data.notes ?? null,
      },
    });
    console.log(`  [plan]    updated  "${data.title}"`);
    return updated;
  }
  const created = await prisma.financePlan.create({
    data: {
      title: data.title,
      type: data.type,
      status: data.status,
      goal: data.goal ?? null,
      currentValue: data.currentValue ?? null,
      targetValue: data.targetValue ?? null,
      unit: data.unit ?? null,
      startDate: data.startDate ?? null,
      targetDate: data.targetDate ?? null,
      managedByBot: data.managedByBot ?? 'emerald',
      milestones: data.milestones ?? [],
      notes: data.notes ?? null,
    },
  });
  console.log(`  [plan]    created  "${data.title}"`);
  return created;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const ACCOUNTS = [
  // ── Checking ──────────────────────────────────────────────────────────────
  { name: 'Business Checking …5359',         type: 'checking',   balance:    240.69 },
  { name: 'Business Checking …4340',         type: 'checking',   balance:      7.73 },
  { name: 'Operating Account …4529',         type: 'checking',   balance:    201.43 },
  { name: 'Everyday Checking …8221',         type: 'checking',   balance:    822.81 },
  { name: 'Chase Total Checking …0551',      type: 'checking',   balance:     74.83 },
  { name: 'Capital One 360 Checking …0801',  type: 'checking',   balance:      4.95 },
  // ── Savings ───────────────────────────────────────────────────────────────
  { name: 'Capital One 360 Savings …1189',   type: 'savings',    balance:      0.00 },
  { name: 'HSA',                             type: 'savings',    balance:     84.18 },
  // ── Investment ────────────────────────────────────────────────────────────
  { name: 'Betterment',                      type: 'investment', balance:   3066.45 },
  // ── Credit ────────────────────────────────────────────────────────────────
  { name: 'Wells Fargo Active Cash …9910',   type: 'credit',     balance:  -1361.96 },
  { name: 'Chase Freedom Unlimited …3948',   type: 'credit',     balance: -19371.59 },
  { name: 'Capital One Quicksilver …9311',   type: 'credit',     balance:  -8862.63 },
];

const PAYABLES = [
  {
    vendor: 'Mortgage',
    amount: 2700.00,
    dueDate: new Date('2026-05-01'),
    description: 'Monthly mortgage payment',
    status: 'pending',
  },
  {
    vendor: 'Storage Unit',
    amount: 120.00,
    dueDate: new Date('2026-04-19'),
    description: 'Monthly storage unit fee — unit must be cleared before this date',
    status: 'pending',
  },
  {
    vendor: 'Social Media Manager',
    amount: 1500.00,
    dueDate: new Date('2026-04-10'),
    description: 'Contractor invoice — pay and pause contract',
    status: 'pending',
  },
  {
    vendor: 'House Cleaner',
    amount: 170.00,
    dueDate: null,
    description: 'Pending — Zelle issue needs to be resolved',
    status: 'pending',
  },
];

const PLANS = [
  {
    title: 'Storage Unit Liquidation',
    type: FinancePlanType.CUSTOM,
    status: FinancePlanStatus.ACTIVE,
    goal: 'Generate $1,000+ by selling storage unit contents before April 19, 2026',
    currentValue: 0,
    targetValue: 1000,
    unit: 'USD',
    startDate: new Date('2026-04-01'),
    targetDate: new Date('2026-04-19'),
    managedByBot: 'emerald',
    milestones: [
      { label: 'Marketplace listing posted' },
      { label: 'Buyers scheduled' },
      { label: 'Unit cleared before April 19' },
    ],
    notes: 'Storage unit payment of $120 due April 19. Unit must be cleared to avoid next billing cycle.',
  },
  {
    title: 'Cash Flow Stabilization',
    type: FinancePlanType.BUDGET,
    status: FinancePlanStatus.ACTIVE,
    goal: 'Increase liquid cash and reduce short-term financial pressure',
    currentValue: 1352,
    targetValue: 5000,
    unit: 'USD',
    startDate: new Date('2026-04-01'),
    targetDate: new Date('2026-09-30'),
    managedByBot: 'emerald',
    milestones: [
      { label: 'Liquidate storage unit items' },
      { label: 'Evaluate HSA and Betterment balances' },
      { label: 'Reduce unnecessary contractor expenses' },
    ],
    notes:
      'Current liquid cash: $1,352. Credit exposure: $29,596. ' +
      'Chase Freedom Unlimited ($19,372) is the dominant liability at 65% of total debt. ' +
      'Capital One Quicksilver ($8,863) accounts for another 30%.',
  },
  {
    title: 'Finance System Implementation',
    type: FinancePlanType.CUSTOM,
    status: FinancePlanStatus.ACTIVE,
    goal: 'Populate the Mothership finance dashboard with structured real-world data',
    currentValue: 0,
    targetValue: 4,
    unit: 'milestones',
    startDate: new Date('2026-04-10'),
    targetDate: new Date('2026-04-30'),
    managedByBot: 'emerald',
    milestones: [
      { label: 'Seed accounts' },
      { label: 'Import transactions' },
      { label: 'Add payables' },
      { label: 'Verify /api/v2/finance/overview response' },
    ],
    notes: 'Tracking implementation progress of the Mothership finance module.',
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n── Accounts ─────────────────────────────────────');
  for (const account of ACCOUNTS) {
    await upsertAccount(account);
  }

  console.log('\n── Payables ─────────────────────────────────────');
  for (const payable of PAYABLES) {
    await upsertPayable(payable);
  }

  console.log('\n── Finance Plans ────────────────────────────────');
  for (const plan of PLANS) {
    await upsertPlan(plan);
  }

  console.log('\n── Summary ──────────────────────────────────────');
  const accounts  = await prisma.account.count();
  const payables  = await prisma.payable.count();
  const plans     = await prisma.financePlan.count();
  console.log(`  Accounts:  ${accounts}`);
  console.log(`  Payables:  ${payables}`);
  console.log(`  Plans:     ${plans}`);
  console.log('\n[seed] Done.\n');
}

main()
  .catch((err) => {
    console.error('[seed] Fatal error:', err);
    prisma.$disconnect().finally(() => process.exit(1));
  })
  .finally(() => prisma.$disconnect());
