import { prisma } from '@/lib/prisma';
import { SubmissionValidationStatus } from '@/lib/db/prisma-types';

export async function listSubmissions(workflowId: string) {
  return prisma.submission.findMany({
    where: { workflowId },
    include: { submittedBy: true },
    orderBy: { submittedAt: 'desc' },
  });
}

export async function createSubmission(input: {
  workflowId: string;
  submittedById?: string | null;
  sourceChannel: string;
  fileName?: string | null;
  rawPayload: any;
}) {
  return prisma.submission.create({
    data: {
      workflowId: input.workflowId,
      submittedById: input.submittedById ?? null,
      sourceChannel: input.sourceChannel,
      fileName: input.fileName ?? null,
      rawPayload: input.rawPayload,
      validationStatus: SubmissionValidationStatus.PENDING,
    },
  });
}
