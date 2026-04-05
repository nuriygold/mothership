import { PrismaClient, WorkflowStatus, SubmissionStatus, RunStatus, ApprovalStatus } from '@prisma/client';

const prisma = new PrismaClient();

export async function emitEvent(userId: string, workflowRunId: string | null, eventType: string, data: any) {
  await prisma.auditEvent.create({
    data: {
      userId,
      workflowRunId,
      eventType,
      data,
      timestamp: new Date(),
    }
  });
}

export async function createWorkflow(userId: string, name: string, description: string, schemaId: string) {
  const workflow = await prisma.workflow.create({
    data: {
      name,
      description,
      status: WorkflowStatus.ACTIVE,
      ownerId: userId,
      schemaId
    }
  });
  await emitEvent(userId, null, 'WORKFLOW_CREATED', { workflowId: workflow.id });
  return workflow;
}

export async function submitWorkflow(userId: string, workflowId: string, submissionData: any) {
  const submission = await prisma.submission.create({
    data: {
      data: submissionData,
      status: SubmissionStatus.PENDING,
      userId,
      workflowId
    }
  });
  await emitEvent(userId, null, 'SUBMISSION_RECEIVED', { submissionId: submission.id });
  return submission;
}

export async function validateSubmission(submissionId: string, isValid: boolean, userId: string) {
  const status = isValid ? SubmissionStatus.VALIDATED : SubmissionStatus.REJECTED;

  const submission = await prisma.submission.update({
    where: { id: submissionId },
    data: { status }
  });
  await emitEvent(userId, null, 'SUBMISSION_VALIDATED', { submissionId, isValid });
  return submission;
}

export async function createRun(submissionId: string | null, workflowId: string, userId: string) {
  const run = await prisma.workflowRun.create({
    data: {
      submissionId,
      workflowId,
      userId,
      status: RunStatus.QUEUED,
      startedAt: new Date()
    }
  });
  await emitEvent(userId, run.id, 'RUN_STARTED', { runId: run.id });
  return run;
}

export async function requestApproval(userId: string, submissionId: string | null, workflowId: string | null) {
  const approval = await prisma.approval.create({
    data: {
      status: ApprovalStatus.REQUESTED,
      requestedAt: new Date(),
      userId,
      submissionId,
      workflowId
    }
  });
  await emitEvent(userId, null, 'APPROVAL_REQUESTED', { approvalId: approval.id });
  return approval;
}
