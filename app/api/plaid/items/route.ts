import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const items = await prisma.plaidItem.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      itemId: true,
      institutionName: true,
      status: true,
      errorCode: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return Response.json({ items });
}
