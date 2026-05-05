import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  mcExecutionAttempts,
  type ExecutionStatus,
  type McExecutionAttempt,
  type McExecutionAttemptInsert,
} from '../../../db/dispatch-schema';
import { record } from './events';
import type { JsonValue } from '../../../db/json';

export async function nextAttemptNumber(campaignId: string): Promise<number> {
  const rows = await db
    .select({ attemptNumber: mcExecutionAttempts.attemptNumber })
    .from(mcExecutionAttempts)
    .where(eq(mcExecutionAttempts.campaignId, campaignId))
    .orderBy(desc(mcExecutionAttempts.attemptNumber))
    .limit(1);
  return (rows[0]?.attemptNumber ?? 0) + 1;
}

export async function startAttempt(
  input: Omit<McExecutionAttemptInsert, 'attemptNumber' | 'status'> & {
    attemptNumber?: number;
  },
): Promise<McExecutionAttempt> {
  const attemptNumber = input.attemptNumber ?? (await nextAttemptNumber(input.campaignId));
  const [row] = await db
    .insert(mcExecutionAttempts)
    .values({ ...input, attemptNumber, status: 'started' })
    .returning();
  await record(input.campaignId, 'execution_started', `Attempt ${attemptNumber} started`, {
    attemptId: row.id,
    attemptNumber,
    agentId: row.agentId,
  });
  return row;
}

export async function finishAttempt(
  attemptId: string,
  status: ExecutionStatus,
  outputPayload: JsonValue = {},
  errorMessage?: string,
): Promise<McExecutionAttempt | undefined> {
  const [row] = await db
    .update(mcExecutionAttempts)
    .set({
      status,
      outputPayload,
      errorMessage,
      completedAt: new Date(),
    })
    .where(eq(mcExecutionAttempts.id, attemptId))
    .returning();
  if (!row) return undefined;
  const evType = status === 'succeeded' ? 'execution_progress' : status === 'failed' ? 'execution_failed' : 'execution_progress';
  await record(row.campaignId, evType, `Attempt ${row.attemptNumber} ${status}`, {
    attemptId: row.id,
    status,
    errorMessage: errorMessage ?? null,
  });
  return row;
}

export async function listAttempts(campaignId: string): Promise<McExecutionAttempt[]> {
  return db
    .select()
    .from(mcExecutionAttempts)
    .where(eq(mcExecutionAttempts.campaignId, campaignId))
    .orderBy(desc(mcExecutionAttempts.startedAt));
}

export async function latestAttempt(
  campaignId: string,
): Promise<McExecutionAttempt | undefined> {
  const rows = await db
    .select()
    .from(mcExecutionAttempts)
    .where(eq(mcExecutionAttempts.campaignId, campaignId))
    .orderBy(desc(mcExecutionAttempts.startedAt))
    .limit(1);
  return rows[0];
}

export async function listRunningAttempts(): Promise<McExecutionAttempt[]> {
  return db
    .select()
    .from(mcExecutionAttempts)
    .where(eq(mcExecutionAttempts.status, 'started'))
    .orderBy(desc(mcExecutionAttempts.startedAt));
}
