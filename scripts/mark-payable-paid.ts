/**
 * Mark Payable Paid
 *
 * Finds a payable by vendor name and sets its status to "paid".
 *
 * Usage:
 *   npm run finance:mark-paid -- --vendor "Storage Unit"
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

const prisma = new PrismaClient();

function parseArgs() {
  const args = process.argv.slice(2);
  let vendor = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--vendor' && args[i + 1]) vendor = args[++i];
  }

  return { vendor };
}

async function main() {
  const { vendor } = parseArgs();

  if (!vendor) {
    console.error('Error: --vendor is required');
    process.exit(1);
  }

  const payable = await prisma.payable.findFirst({ where: { vendor } });
  if (!payable) {
    console.error(`Error: No payable found with vendor "${vendor}"`);
    process.exit(1);
  }

  const updated = await prisma.payable.update({
    where: { id: payable.id },
    data: { status: 'paid' },
  });

  console.log(`[mark-paid] "${updated.vendor}" → status: ${updated.status}`);
}

main()
  .catch((err) => {
    console.error('[mark-paid] Fatal error:', err);
    prisma.$disconnect().finally(() => process.exit(1));
  })
  .finally(() => prisma.$disconnect());
