import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const balances = await prisma.account.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      type: true,
      currency: true,
      balance: true,
      liquid: true,
      updatedAt: true,
    },
  });
  return Response.json({ balances });
}
