import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { financeEvents } from '@/lib/db/schema';
import type { InputJsonObject } from '@/lib/db/json';
import { processFinanceEvent } from '@/lib/finance/eventProcessor';

export type FinanceEventPriority = 'low' | 'normal' | 'high' | 'critical';

export type FinanceEventType =
  | 'BILL_DUE'
  | 'TRANSACTION_DETECTED'
  | 'SUBSCRIPTION_DETECTED'
  | 'PAYMENT_MADE'
  | 'PLAN_MILESTONE'
  | 'FINANCIAL_EMAIL'
  | 'PLAN_PROGRESS'
  | 'ALERT';

export async function createFinanceEvent(
  type: FinanceEventType | string,
  source: string,
  payload: Record<string, unknown> & { priority?: FinanceEventPriority }
) {
  const { priority = 'normal', ...rest } = payload;
  const [event] = await db
    .insert(financeEvents)
    .values({
      id: randomUUID(),
      type,
      source,
      payload: rest as InputJsonObject,
      priority,
    })
    .returning();

  // Process rules async — never blocks the caller, never throws
  processFinanceEvent(event).catch(() => {});

  return event;
}

export async function resolveFinanceEvent(id: string) {
  const [updated] = await db
    .update(financeEvents)
    .set({ resolved: true })
    .where(eq(financeEvents.id, id))
    .returning();

  return updated;
}

export async function listUnresolvedFinanceEvents(limit = 20) {
  return db
    .select()
    .from(financeEvents)
    .where(eq(financeEvents.resolved, false))
    .orderBy(desc(financeEvents.createdAt))
    .limit(limit);
}
