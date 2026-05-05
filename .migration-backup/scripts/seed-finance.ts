/**
 * Finance Seed Script
 *
 * Seeds real financial data into the database:
 *   - 10 Accounts  (checking, investment, credit, loan, income)
 *   -  5 Payables  (mortgages, HVAC, storage, contractor)
 *   -  4 FinancePlans
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

import { db } from '../lib/db/client';
import * as schema from '../lib/db/schema';
import { eq, notInArray, sql } from 'drizzle-orm';
import crypto from 'crypto';
import { FinancePlanType, FinancePlanStatus } from '../lib/db/enums';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function upsertAccount(data: {
  name: string;
  type: string;
  balance: number;
  liquid?: boolean;
  currency?: string;
}) {
  const existing = await db.query.accounts.findFirst({
    where: eq(schema.accounts.name, data.name),
  });

  if (existing) {
    const [updated] = await db.update(schema.accounts)
      .set({
        type: data.type,
        balance: data.balance,
        liquid: data.liquid ?? true,
        updatedAt: new Date(),
      })
      .where(eq(schema.accounts.id, existing.id))
      .returning();
    console.log(`  [account] updated  "${data.name}" → $${data.balance} (liquid: ${data.liquid ?? true})`);
    return updated;
  }

  const [created] = await db.insert(schema.accounts).values({
    id: crypto.randomUUID(),
    name: data.name,
    type: data.type,
    balance: data.balance,
    liquid: data.liquid ?? true,
    currency: data.currency ?? 'USD',
    updatedAt: new Date(),
  }).returning();
  console.log(`  [account] created  "${data.name}" → $${data.balance} (liquid: ${data.liquid ?? true})`);
  return created;
}

async function upsertPayable(data: {
  vendor: string;
  amount: number;
  dueDate?: Date | null;
  description?: string;
  status?: string;
}) {
  const existing = await db.query.payables.findFirst({
    where: eq(schema.payables.vendor, data.vendor),
  });

  if (existing) {
    const [updated] = await db.update(schema.payables)
      .set({
        amount: data.amount,
        dueDate: data.dueDate ?? null,
        description: data.description ?? null,
        status: data.status ?? existing.status,
        updatedAt: new Date(),
      })
      .where(eq(schema.payables.id, existing.id))
      .returning();
    console.log(`  [payable] updated  "${data.vendor}" → $${data.amount}`);
    return updated;
  }

  const [created] = await db.insert(schema.payables).values({
    id: crypto.randomUUID(),
    vendor: data.vendor,
    amount: data.amount,
    dueDate: data.dueDate ?? null,
    description: data.description ?? null,
    status: data.status ?? 'pending',
    updatedAt: new Date(),
  }).returning();
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
  milestones?: any;
  notes?: string;
}) {
  const existing = await db.query.financePlans.findFirst({
    where: eq(schema.financePlans.title, data.title),
  });

  if (existing) {
    const [updated] = await db.update(schema.financePlans)
      .set({
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
        updatedAt: new Date(),
      })
      .where(eq(schema.financePlans.id, existing.id))
      .returning();
    console.log(`  [plan]    updated  "${data.title}"`);
    return updated;
  }

  const [created] = await db.insert(schema.financePlans).values({
    id: crypto.randomUUID(),
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
    updatedAt: new Date(),
  }).returning();
  console.log(`  [plan]    created  "${data.title}"`);
  return created;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const ACCOUNTS = [
  // ── Checking ──────────────────────────────────────────────────────────────
  { name: 'Primary Checking',                type: 'checking',   balance:   4549.00, liquid: true  },
  // ── Investment ────────────────────────────────────────────────────────────
  { name: 'Betterment',                      type: 'investment', balance:   2383.00, liquid: true  },
  { name: 'Robinhood',                       type: 'investment', balance:    100.00, liquid: true  },
  // ── Credit ────────────────────────────────────────────────────────────────
  { name: 'Chase Credit Card',               type: 'credit',     balance: -19371.00, liquid: false },
  { name: 'Capital One Credit Card',         type: 'credit',     balance:  -8862.00, liquid: false },
  { name: 'Apple Card',                      type: 'credit',     balance:  -4596.00, liquid: false },
  { name: 'Wells Fargo Credit Card',         type: 'credit',     balance:  -1457.00, liquid: false },
  // ── Loans ─────────────────────────────────────────────────────────────────
  { name: 'Freedom Mortgage (Clairmont)',    type: 'loan',       balance: -287804.00, liquid: false },
  { name: 'Planet Home Lending (Peters)',    type: 'loan',       balance: -216664.00, liquid: false },
  // ── Income ────────────────────────────────────────────────────────────────
  { name: 'Rental Property Cashflow',        type: 'income',     balance:   2500.00, liquid: true  },
];

const PAYABLES = [
  {
    vendor: 'Planet Home Lending',
    amount: 2120.75,
    dueDate: new Date('2026-05-01'),
    description: 'Mortgage payment — 322 Peters St SW Unit 5. CURRENT. Must stay perfect.',
    status: 'pending',
  },
  {
    vendor: 'Freedom Mortgage',
    amount: 2622.77,
    dueDate: new Date('2026-05-01'),
    description: 'Mortgage payment — 2459 Clairmont Rd NE. In loss-mitigation review. Delinquency: $21,537.80. Do NOT pay delinquency directly — wait for deferral/modification decision.',
    status: 'pending',
  },
  {
    vendor: 'HVAC Condenser',
    amount: 2000.00,
    dueDate: null,
    description: '2.5 ton R-410A condenser purchase for rental property. Budget ~$2,000.',
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
    type: 'CUSTOM' as FinancePlanType,
    status: 'ACTIVE' as FinancePlanStatus,
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
    type: 'BUDGET' as FinancePlanType,
    status: 'ACTIVE' as FinancePlanStatus,
    goal: 'Increase liquid cash and reduce short-term financial pressure',
    currentValue: 4503.07,
    targetValue: 5000,
    unit: 'USD',
    startDate: new Date('2026-04-01'),
    targetDate: new Date('2026-09-30'),
    managedByBot: 'emerald',
    milestones: [
      { label: 'Liquidate storage unit items' },
      { label: 'Install HVAC condenser for rental property' },
      { label: 'Pause unnecessary contractor expenses' },
      { label: 'PTO payout received (June)' },
      { label: 'Cash buffer reaches $7k', targetValue: 7000 },
      { label: 'Cash buffer reaches $10k', targetValue: 10000 },
    ],
    notes:
      'Approx liquid cash now ~$4.5k. Rental income $2,500/mo stable through Dec 2028. ' +
      'Freedom Mortgage in loss mitigation review (~$21,537 delinquency). ' +
      'Primary credit exposure remains Chase Freedom Unlimited (~$19k) and Capital One (~$8.8k).',
  },
  {
    title: 'Mortgage Stabilization',
    type: 'CUSTOM' as FinancePlanType,
    status: 'ACTIVE' as FinancePlanStatus,
    goal: 'Maintain Planet Home mortgage current while resolving Freedom Mortgage loss mitigation outcome',
    currentValue: 1,
    targetValue: 3,
    unit: 'milestones',
    startDate: new Date('2026-04-12'),
    targetDate: new Date('2026-07-01'),
    managedByBot: 'emerald',
    milestones: [
      { label: 'Loss mitigation review decision received' },
      { label: 'Install HVAC condenser at rental property' },
      { label: 'Maintain Planet mortgage current for 90 days' },
    ],
    notes:
      'Planet Home mortgage ($2,120/mo) is current. Freedom Mortgage ($2,622/mo) currently under review ' +
      'with expected response within ~5–7 days. Strategy is to protect the performing loan while ' +
      'negotiating modification or deferral on the delinquent loan.',
  },
  {
    title: 'Finance System Implementation',
    type: 'CUSTOM' as FinancePlanType,
    status: 'ACTIVE' as FinancePlanStatus,
    goal: 'Populate the Mothership finance dashboard with structured real-world data',
    currentValue: 1,
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
  // Delete any accounts/payables not in the current seed (keeps DB in sync)
  const keepAccountNames = ACCOUNTS.map((a) => a.name);
  const keepVendorNames  = PAYABLES.map((p) => p.vendor);
  const keepPlanTitles   = PLANS.map((p) => p.title);

  const staleAccounts = await db.query.accounts.findMany({
    where: notInArray(schema.accounts.name, keepAccountNames),
  });
  const stalePayables = await db.query.payables.findMany({
    where: notInArray(schema.payables.vendor, keepVendorNames),
  });
  const stalePlans = await db.query.financePlans.findMany({
    where: notInArray(schema.financePlans.title, keepPlanTitles),
  });

  if (staleAccounts.length || stalePayables.length || stalePlans.length) {
    console.log('\n── Cleanup ───────────────────────────────────────');
    for (const a of staleAccounts) {
      await db.delete(schema.accounts).where(eq(schema.accounts.id, a.id));
      console.log(`  [account] deleted  "${a.name}"`);
    }
    for (const p of stalePayables) {
      await db.delete(schema.payables).where(eq(schema.payables.id, p.id));
      console.log(`  [payable] deleted  "${p.vendor}"`);
    }
    for (const p of stalePlans) {
      await db.delete(schema.financePlans).where(eq(schema.financePlans.id, p.id));
      console.log(`  [plan]    deleted  "${p.title}"`);
    }
  }

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
  const accountsResult = await db.select({ count: sql<number>`count(*)` }).from(schema.accounts);
  const payablesResult = await db.select({ count: sql<number>`count(*)` }).from(schema.payables);
  const plansResult    = await db.select({ count: sql<number>`count(*)` }).from(schema.financePlans);
  
  console.log(`  Accounts:  ${accountsResult[0].count}`);
  console.log(`  Payables:  ${payablesResult[0].count}`);
  console.log(`  Plans:     ${plansResult[0].count}`);
  console.log('\n[seed] Done.\n');
}

main()
  .catch((err) => {
    console.error('[seed] Fatal error:', err);
    process.exit(1);
  });
