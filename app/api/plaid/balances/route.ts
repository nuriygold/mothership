import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Adjust model and fields to match actual Prisma schema
  const balances = await prisma.plaidBalance.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      accountId: true,
      available: true,
      current: true,
      isoCurrencyCode: true,
      institutionName: true,
      updatedAt: true,
    },
  });
  return Response.json({ balances });
}
