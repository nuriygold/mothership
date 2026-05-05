/**
 * Update Account Balance
 *
 * Finds an account by name and updates its balance.
 *
 * Usage:
 *   npm run finance:update-balance -- --name "Chase Total Checking …0551" --balance 1234.56
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
import { eq } from 'drizzle-orm';

function parseArgs() {
  const args = process.argv.slice(2);
  let name = '';
  let balance: number | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) name = args[++i];
    if (args[i] === '--balance' && args[i + 1]) balance = parseFloat(args[++i]);
  }

  return { name, balance };
}

async function main() {
  const { name, balance } = parseArgs();

  if (!name) {
    console.error('Error: --name is required');
    process.exit(1);
  }
  if (balance === null || isNaN(balance)) {
    console.error('Error: --balance is required and must be a number');
    process.exit(1);
  }

  const account = await db.query.accounts.findFirst({
    where: eq(schema.accounts.name, name),
  });
  if (!account) {
    console.error(`Error: No account found with name "${name}"`);
    process.exit(1);
  }

  const [updated] = await db.update(schema.accounts)
    .set({ balance, updatedAt: new Date() })
    .where(eq(schema.accounts.id, account.id))
    .returning();

  console.log(`[update-balance] "${updated.name}" → $${updated.balance}`);
}

main()
  .catch((err) => {
    console.error('[update-balance] Fatal error:', err);
    process.exit(1);
  });
