import { prisma } from '@/lib/prisma';
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
  const event = await prisma.financeEvent.create({
    data: {
      type,
      source,
      payload: rest as InputJsonObject,
      priority,
    },
  });

  // Process rules async — never blocks the caller, never throws
  processFinanceEvent(event).catch(() => {});

  return event;
}

export async function resolveFinanceEvent(id: string) {
  return prisma.financeEvent.update({
    where: { id },
    data: { resolved: true },
  });
}

export async function listUnresolvedFinanceEvents(limit = 20) {
  return prisma.financeEvent.findMany({
    where: { resolved: false },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}
