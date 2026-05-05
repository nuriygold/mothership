import { desc, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db/client';
import { submissions, users } from '@/lib/db/schema';
import { SubmissionValidationStatus } from '@/lib/db/enums';

type SubmissionRow = typeof submissions.$inferSelect;

function keyById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

async function hydrateSubmissions(rows: SubmissionRow[]) {
  const userIds = rows.map((row) => row.submittedById).filter((id): id is string => Boolean(id));
  const userRows = userIds.length ? await db.select().from(users).where(inArray(users.id, userIds)) : [];
  const usersById = keyById(userRows);

  return rows.map((row) => ({
    ...row,
    submittedBy: row.submittedById ? (usersById.get(row.submittedById) ?? null) : null,
  }));
}

export async function listSubmissions(workflowId: string) {
  const rows = await db
    .select()
    .from(submissions)
    .where(eq(submissions.workflowId, workflowId))
    .orderBy(desc(submissions.submittedAt));

  return hydrateSubmissions(rows);
}

export async function createSubmission(input: {
  workflowId: string;
  submittedById?: string | null;
  sourceChannel: string;
  fileName?: string | null;
  rawPayload: any;
}) {
  const [created] = await db
    .insert(submissions)
    .values({
      id: randomUUID(),
      workflowId: input.workflowId,
      submittedById: input.submittedById ?? null,
      sourceChannel: input.sourceChannel,
      fileName: input.fileName ?? null,
      rawPayload: input.rawPayload,
      validationStatus: SubmissionValidationStatus.PENDING,
    })
    .returning();

  const [submission] = await hydrateSubmissions([created]);
  return submission;
}
