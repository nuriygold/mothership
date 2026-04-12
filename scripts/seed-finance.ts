/**
 * Finance Seed Script
 *
 * Seeds real financial data into the database:
 *   - 12 Accounts  (checking, savings, investment, credit)
 *   -  6 Payables  (mortgages, HVAC, storage, contractors)
 *   -  5 FinancePlans
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

import { PrismaClient } from '@prisma/client';

// Use string literals to avoid dependency on generated Prisma enum exports
type PlanType   = 'CREDIT_SCORE' | 'BUDGET' | 'SAVINGS' | 'DEBT_PAYOFF' | 'INVESTMENT' | 'EXPENSE_REDUCTION' | 'CUSTOM';
type PlanStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';

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
  type: PlanType;
  status: PlanStatus;
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
    vendor: 'Planet Home Mortgage (Peters)',
    amount: 2120.75,
    dueDate: new Date('2026-05-01'),
    description: 'Second mortgage — CURRENT. Balance ~$216,664. Rate 6.0%. Must stay perfect.',
    status: 'pending',
  },
  {
    vendor: 'Freedom Mortgage (Clairmont)',
    amount: 21537.80,
    dueDate: null,
    description: 'Primary mortgage — DELINQUENT 198 days as of Mar 18. In loss-mitigation review. Amount to bring current: $21,537.80. Monthly payment ~$2,622.77. Loan balance ~$287,804. Rate 4.625%. April payment likely not required while under review. Resolution expected within days.',
    status: 'overdue',
  },
  {
    vendor: 'HVAC Condenser',
    amount: 2000.00,
    dueDate: null,
    description: 'Capital need — purchase and install condenser. Budget ~$2,000.',
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
    type: 'CUSTOM' as PlanType,
    status: 'ACTIVE' as PlanStatus,
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
    type: 'BUDGET' as PlanType,
    status: 'ACTIVE' as PlanStatus,
    goal: 'Stabilize monthly cash flow while Freedom Mortgage loss-mitigation resolves',
    currentValue: 6000,
    targetValue: 10000,
    unit: 'USD',
    startDate: new Date('2026-04-01'),
    targetDate: new Date('2026-09-30'),
    managedByBot: 'emerald',
    milestones: [
      { label: 'Freedom Mortgage mitigation decision received' },
      { label: 'HVAC condenser installed' },
      { label: 'PTO cash-out received (June, ~100 hrs)' },
      { label: 'Planet Home mortgage current through Q3' },
      { label: 'Credit card minimums automated' },
    ],
    notes:
      'Income: Salary ~$7k/mo net + Rent $2,500/mo (lease through Dec 2028). ' +
      'Cash ~$6k. Next paycheck ~$3,250. ' +
      'Priority order: Planet Home ($2,120) → HVAC fund ($800–1,000) → credit minimums → living expenses. ' +
      'Freedom Mortgage in loss-mitigation — do NOT pay $21,537 directly, wait for deferral/modification decision. ' +
      'PTO: 100 hrs submitted, June payroll. Projected remaining ~60+ hrs. ' +
      'Credit exposure: $29,596 (Chase Freedom $19,372 | CapOne $8,863 | WF $1,362).',
  },
  {
    title: 'Freedom Mortgage Resolution',
    type: 'DEBT_PAYOFF' as PlanType,
    status: 'ACTIVE' as PlanStatus,
    goal: 'Resolve Freedom Mortgage delinquency through loss-mitigation (deferral or modification)',
    currentValue: 0,
    targetValue: 1,
    unit: 'decision',
    startDate: new Date('2026-03-18'),
    targetDate: new Date('2026-05-01'),
    managedByBot: 'emerald',
    milestones: [
      { label: 'Loss-mitigation application submitted' },
      { label: 'Servicer decision received (deferral or modification)' },
      { label: 'Agreement signed' },
      { label: 'First payment under new terms made' },
    ],
    notes:
      'Primary mortgage on Clairmont property. Delinquent since Sept 1, 2025 (198 days as of Mar 18). ' +
      'Loan balance ~$287,804. Rate 4.625%. Monthly payment ~$2,622.77. ' +
      'In active loss-mitigation review — April payment likely not required during review. ' +
      'Do NOT attempt to pay $21,537 delinquency directly. Resolution comes through servicer agreement. ' +
      'Rental income $2,500/mo through Dec 2028 supports future financing.',
  },
  {
    title: 'HVAC Condenser Installation',
    type: 'CUSTOM' as PlanType,
    status: 'ACTIVE' as PlanStatus,
    goal: 'Purchase and install HVAC condenser',
    currentValue: 0,
    targetValue: 2000,
    unit: 'USD',
    startDate: new Date('2026-04-12'),
    targetDate: new Date('2026-05-31'),
    managedByBot: 'emerald',
    milestones: [
      { label: 'Get 2–3 quotes' },
      { label: 'Fund secured ($2,000)' },
      { label: 'Installation scheduled' },
      { label: 'Installation complete' },
    ],
    notes: 'Capital need. Budget ~$2,000. Fund from next paycheck cycle ($800–1,000 per check).',
  },
  {
    title: 'Finance System Implementation',
    type: 'CUSTOM' as PlanType,
    status: 'ACTIVE' as PlanStatus,
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
