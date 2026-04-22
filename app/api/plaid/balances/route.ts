import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const accounts = await prisma.account.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      balance: true,
      currency: true,
      updatedAt: true,
    },
  });

  const balances = accounts.map((account) => ({
    id: account.id,
    accountId: account.id,
    available: account.balance,
    current: account.balance,
    isoCurrencyCode: account.currency,
    institutionName: account.name,
    updatedAt: account.updatedAt,
  }));

  return Response.json({ balances });
}
