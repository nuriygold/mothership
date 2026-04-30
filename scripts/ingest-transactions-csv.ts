/**
 * Ingest Transactions from CSV
 *
 * Parses a bank CSV export and inserts transactions into the database.
 * Skips duplicates matched by: accountId + description + amount + date (same day).
 *
 * Supports Chase and Capital One CSV formats. Detects format automatically.
 *
 * Chase columns:    Transaction Date, Post Date, Description, Category, Type, Amount, Memo
 * CapOne columns:   Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit
 *
 * Usage:
 *   npm run finance:ingest-csv -- --file exports/chase.csv --accountId <uuid>
 *   npm run finance:ingest-csv -- --file exports/capone.csv --accountId <uuid> --bot Emerald
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

import { db } from '../lib/db/client';
import * as schema from '../lib/db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCSVLine(lines[0]).map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? '').trim(); });
    return row;
  });
}

function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// Format detection + normalization
// ---------------------------------------------------------------------------

type NormalizedRow = {
  description: string;
  amount: number;       // positive = income, negative = expense
  type: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  category: string | null;
  occurredAt: Date;
};

function detectFormat(headers: string[]): 'chase' | 'capone' | 'unknown' {
  const h = headers.map((x) => x.toLowerCase());
  if (h.includes('transaction date') && h.includes('post date') && h.includes('amount')) return 'chase';
  if (h.includes('transaction date') && h.includes('debit') && h.includes('credit')) return 'capone';
  return 'unknown';
}

function normalizeChase(row: Record<string, string>): NormalizedRow | null {
  const description = row['Description']?.trim();
  const rawAmount = parseFloat(row['Amount'] ?? '');
  const dateStr = row['Transaction Date']?.trim();
  const category = row['Category']?.trim() || null;

  if (!description || isNaN(rawAmount) || !dateStr) return null;

  const occurredAt = new Date(dateStr);
  if (isNaN(occurredAt.getTime())) return null;

  const amount = rawAmount;
  const type = rawAmount < 0 ? 'EXPENSE' : rawAmount > 0 ? 'INCOME' : 'TRANSFER';

  return { description, amount, type, category, occurredAt };
}

function normalizeCapOne(row: Record<string, string>): NormalizedRow | null {
  const description = row['Description']?.trim();
  const debitRaw = row['Debit']?.trim();
  const creditRaw = row['Credit']?.trim();
  const dateStr = row['Transaction Date']?.trim();
  const category = row['Category']?.trim() || null;

  if (!description || !dateStr) return null;

  const occurredAt = new Date(dateStr);
  if (isNaN(occurredAt.getTime())) return null;

  let amount = 0;
  let type: 'INCOME' | 'EXPENSE' | 'TRANSFER' = 'EXPENSE';

  if (debitRaw && debitRaw !== '') {
    amount = -Math.abs(parseFloat(debitRaw));
    type = 'EXPENSE';
  } else if (creditRaw && creditRaw !== '') {
    amount = Math.abs(parseFloat(creditRaw));
    type = 'INCOME';
  } else {
    return null;
  }

  if (isNaN(amount)) return null;

  return { description, amount, type, category, occurredAt };
}

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  let file = '';
  let accountId = '';
  let bot = 'Emerald';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' && args[i + 1]) file = args[++i];
    if (args[i] === '--accountId' && args[i + 1]) accountId = args[++i];
    if (args[i] === '--bot' && args[i + 1]) bot = args[++i];
  }

  return { file, accountId, bot };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { file, accountId, bot } = parseArgs();

  if (!file) { console.error('Error: --file is required'); process.exit(1); }
  if (!accountId) { console.error('Error: --accountId is required'); process.exit(1); }

  const filePath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }

  const account = await db.query.accounts.findFirst({
    where: eq(schema.accounts.id, accountId),
  });
  if (!account) {
    console.error(`Error: No account found with id "${accountId}"`);
    process.exit(1);
  }

  console.log(`\n── Ingesting into "${account.name}" ─────────────────`);

  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(raw);

  if (rows.length === 0) {
    console.log('No rows found in CSV.');
    return;
  }

  const format = detectFormat(Object.keys(rows[0]));
  console.log(`  Detected format: ${format} (${rows.length} rows)`);

  if (format === 'unknown') {
    console.error('Error: Unrecognized CSV format. Supported: Chase, Capital One.');
    process.exit(1);
  }

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const normalized = format === 'chase' ? normalizeChase(row) : normalizeCapOne(row);
    if (!normalized) { errors++; continue; }

    const { description, amount, category, occurredAt } = normalized;

    // Duplicate check: same account + description + amount + same calendar day
    const dayStart = new Date(occurredAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(occurredAt);
    dayEnd.setHours(23, 59, 59, 999);

    const existing = await db.query.transactions.findFirst({
      where: and(
        eq(schema.transactions.accountId, accountId),
        eq(schema.transactions.description, description),
        eq(schema.transactions.amount, amount),
        gte(schema.transactions.occurredAt, dayStart),
        lte(schema.transactions.occurredAt, dayEnd)
      ),
    });

    if (existing) { skipped++; continue; }

    await db.transaction(async (tx) => {
      await tx.insert(schema.transactions).values({
        id: crypto.randomUUID(),
        accountId,
        description,
        amount,
        category,
        handledByBot: bot,
        occurredAt,
      });

      await tx.update(schema.accounts)
        .set({
          balance: sql`${schema.accounts.balance} + ${amount}`,
          updatedAt: new Date(),
        })
        .where(eq(schema.accounts.id, accountId));
    });

    inserted++;
    console.log(`  [+] ${occurredAt.toISOString().slice(0, 10)}  ${description.slice(0, 40).padEnd(40)}  $${amount}`);
  }

  console.log(`\n── Summary ──────────────────────────────────────`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Skipped (duplicates): ${skipped}`);
  console.log(`  Unparseable rows: ${errors}`);
  console.log('\n[ingest-csv] Done.\n');
}

main()
  .catch((err) => {
    console.error('[ingest-csv] Fatal error:', err);
    process.exit(1);
  });
