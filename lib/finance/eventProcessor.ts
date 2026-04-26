/**
 * Finance Event Processor
 *
 * Runs immediately after a FinanceEvent is created.
 * Evaluates simple rules and auto-resolves events that don't need human attention.
 * Events that survive processing stay in the Action Feed.
 */

import type { JsonValue } from '@/lib/db/json';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { financeEvents } from '@/lib/db/schema';
import { resolveFinanceEvent } from '@/lib/finance/events';
import { touchMerchant } from '@/lib/finance/merchantProfile';
import { runAnomalyDetection } from '@/lib/finance/anomalyDetector';

// Days threshold — bills due beyond this are not urgent.
const BILL_URGENCY_DAYS = 7;

type FinanceEventRow = {
  id: string;
  type: string;
  source: string;
  payload: JsonValue;
  priority: string;
  resolved: boolean;
  createdAt: Date;
};

type ProcessResult = {
  action: 'resolved' | 'kept' | 'escalated';
  reason: string;
};

// ─── Rule handlers ────────────────────────────────────────────────────────────

// Safe accessor — Prisma returns JsonValue which may be any JSON type
function p(event: FinanceEventRow): Record<string, unknown> {
  return (event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload))
    ? (event.payload as Record<string, unknown>)
    : {};
}

async function processTransactionDetected(event: FinanceEventRow): Promise<ProcessResult> {
  const payload = p(event);
  const rawMerchant = String(payload.description ?? payload.account ?? '').trim();
  const rawAmount   = Math.abs(Number(payload.amount ?? 0));

  if (!rawMerchant) {
    return { action: 'kept', reason: 'No merchant name — needs categorization' };
  }

  const result = await touchMerchant(rawMerchant);

  // Resolve the effective category for anomaly detection
  const effectiveCategory = (result.found && result.category)
    ? result.category
    : String(payload.category ?? '').toLowerCase().trim() || 'general';

  // Run anomaly detection fire-and-forget — never blocks categorization
  if (rawAmount > 0) {
    runAnomalyDetection({
      merchantName: rawMerchant,
      amount:       rawAmount,
      category:     effectiveCategory,
    }).catch(() => {});
  }

  if (result.found && result.category) {
    return {
      action: 'resolved',
      reason: `Known merchant "${rawMerchant}" → category "${result.category}"`,
    };
  }

  if (result.found && !result.category) {
    return {
      action: 'kept',
      reason: `Merchant "${rawMerchant}" seen before but uncategorized`,
    };
  }

  return {
    action: 'kept',
    reason: `New merchant "${rawMerchant}" — profile created, awaiting category`,
  };
}

function processBillDue(event: FinanceEventRow): ProcessResult {
  const payload = p(event);
  const dueDateRaw = payload.dueDate;

  if (!dueDateRaw) {
    return { action: 'kept', reason: 'No due date set — needs scheduling' };
  }

  const dueDate = new Date(String(dueDateRaw));
  if (isNaN(dueDate.getTime())) {
    return { action: 'kept', reason: 'Invalid due date — needs review' };
  }

  const now = new Date();
  const daysUntilDue = Math.ceil(
    (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilDue < 0) {
    return {
      action: 'escalated',
      reason: `Overdue by ${Math.abs(daysUntilDue)} day(s)`,
    };
  }

  if (daysUntilDue <= BILL_URGENCY_DAYS) {
    return {
      action: 'kept',
      reason: `Due in ${daysUntilDue} day(s) — within urgency window`,
    };
  }

  return {
    action: 'resolved',
    reason: `Due in ${daysUntilDue} day(s) — outside urgency window`,
  };
}

function processFinancialEmail(event: FinanceEventRow): ProcessResult {
  const payload = p(event);
  const actionRequired = Boolean(payload.actionRequired);

  if (!actionRequired) {
    return { action: 'resolved', reason: 'No action required' };
  }

  return { action: 'kept', reason: 'Action required — needs review' };
}

function processSubscriptionDetected(_event: FinanceEventRow): ProcessResult {
  return { action: 'kept', reason: 'Subscription detected — awareness required' };
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

async function applyResult(event: FinanceEventRow, result: ProcessResult): Promise<void> {
  const tag = `[eventProcessor:${event.type}:${event.id.slice(0, 8)}]`;

  if (result.action === 'resolved') {
    await resolveFinanceEvent(event.id);
    console.log(`${tag} auto-resolved — ${result.reason}`);
  } else if (result.action === 'escalated') {
    // Update priority to high/critical, keep unresolved
    await db.update(financeEvents).set({ priority: 'high' }).where(eq(financeEvents.id, event.id));
    console.log(`${tag} escalated — ${result.reason}`);
  } else {
    console.log(`${tag} kept — ${result.reason}`);
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function processFinanceEvent(event: FinanceEventRow): Promise<void> {
  try {
    let result: ProcessResult;

    switch (event.type) {
      case 'TRANSACTION_DETECTED':
        result = await processTransactionDetected(event);
        break;
      case 'BILL_DUE':
        result = processBillDue(event);
        break;
      case 'FINANCIAL_EMAIL':
        result = processFinancialEmail(event);
        break;
      case 'SUBSCRIPTION_DETECTED':
        result = processSubscriptionDetected(event);
        break;
      default:
        // Unknown types stay in the feed — no rule, no action
        console.log(`[eventProcessor:${event.type}] no rule defined — kept`);
        return;
    }

    await applyResult(event, result);
  } catch (err) {
    // Processor errors must never break the caller
    console.error(`[eventProcessor:${event.type}:${event.id}] error:`, err);
  }
}
