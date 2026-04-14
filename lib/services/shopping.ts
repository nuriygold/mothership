import { prisma } from '@/lib/prisma';

export async function addShoppingItem(input: {
  name: string;
  notes?: string;
  source?: string;
  emailId?: string;
  emailSubject?: string;
}) {
  return prisma.shoppingItem.create({
    data: {
      name: input.name.trim(),
      notes: input.notes?.trim() || null,
      source: input.source ?? 'manual',
      emailId: input.emailId ?? null,
      emailSubject: input.emailSubject ?? null,
    },
  });
}

export async function listShoppingItems(includeCompleted = false) {
  return prisma.shoppingItem.findMany({
    where: includeCompleted ? undefined : { completedAt: null },
    orderBy: { createdAt: 'desc' },
  });
}

export async function completeShoppingItem(id: string) {
  return prisma.shoppingItem.update({
    where: { id },
    data: { completedAt: new Date() },
  });
}

export async function deleteShoppingItem(id: string) {
  return prisma.shoppingItem.delete({ where: { id } });
}
