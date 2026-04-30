import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { eq, isNull, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export async function addShoppingItem(input: {
  name: string;
  notes?: string;
  source?: string;
  emailId?: string;
  emailSubject?: string;
}) {
  const [item] = await db.insert(schema.shoppingItems).values({
    id: uuidv4(),
    name: input.name.trim(),
    notes: input.notes?.trim() || null,
    source: input.source ?? 'manual',
    emailId: input.emailId ?? null,
    emailSubject: input.emailSubject ?? null,
    updatedAt: new Date(),
  }).returning();
  return item;
}

export async function listShoppingItems(includeCompleted = false) {
  return db.query.shoppingItems.findMany({
    where: includeCompleted ? undefined : isNull(schema.shoppingItems.completedAt),
    orderBy: desc(schema.shoppingItems.createdAt),
  });
}

export async function completeShoppingItem(id: string) {
  const [item] = await db.update(schema.shoppingItems)
    .set({ completedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.shoppingItems.id, id))
    .returning();
  return item;
}

export async function deleteShoppingItem(id: string) {
  const [item] = await db.delete(schema.shoppingItems)
    .where(eq(schema.shoppingItems.id, id))
    .returning();
  return item;
}
