import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.account.count();
  if(count > 0) {
    console.log('Account table already seeded.');
    return;
  }
  await prisma.account.createMany({
    data: [
      { name: 'Operating', type: 'checking', balance: 0 },
      { name: 'Payroll', type: 'checking', balance: 0 },
      { name: 'Betterment', type: 'investment', balance: 0 },
      { name: 'Robinhood', type: 'investment', balance: 0 },
      { name: 'HSA', type: 'savings', balance: 0 },
    ],
  });
  console.log('Seeded Account table with initial accounts.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});
