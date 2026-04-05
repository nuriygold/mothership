import { PrismaClient, WorkflowType, WorkflowStatus, SubmissionValidationStatus, TaskPriority, TaskStatus, RunStatus, ApprovalDecision, ConnectorStatus, CommandStatus } from '@prisma/client';

const prisma = new PrismaClient();

function isLikelyRemoteDatabase(url: string) {
  return /(supabase\.com|render\.com|railway\.app|neon\.tech|rds\.amazonaws\.com|pooler\.supabase\.com)/i.test(url);
}

function assertSeedSafety() {
  const dbUrl = process.env.DATABASE_URL || '';
  const allowProdSeed = process.env.ALLOW_PROD_SEED === 'true';
  const isProdNode = process.env.NODE_ENV === 'production';

  if (!dbUrl) {
    throw new Error('DATABASE_URL is required for seeding.');
  }

  if ((isProdNode || isLikelyRemoteDatabase(dbUrl)) && !allowProdSeed) {
    throw new Error(
      'Safety stop: refusing to seed a production/remote database. Set ALLOW_PROD_SEED=true only when intentionally seeding staging.'
    );
  }
}

async function main() {
  assertSeedSafety();

  await prisma.auditEvent.deleteMany();
  await prisma.command.deleteMany();
  await prisma.connector.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.run.deleteMany();
  await prisma.task.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.workflowSchemaVersion.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.user.deleteMany();

  const adrian = await prisma.user.create({
    data: { email: 'adrian@nuriy.com', name: 'Adrian' },
  });
  const ruby = await prisma.user.create({ data: { email: 'ruby@nuriy.com', name: 'Ruby' } });

  const workflows = await prisma.$transaction([
    prisma.workflow.create({
      data: {
        name: 'Vendor Intake',
        description: 'Standard intake for new vendor onboarding',
        type: WorkflowType.STANDARD,
        status: WorkflowStatus.ACTIVE,
        ownerId: adrian.id,
      },
    }),
    prisma.workflow.create({
      data: {
        name: 'Boomerang: Travel Approval',
        description: 'Structured intake for travel approvals via Boomerang',
        type: WorkflowType.BOOMERANG,
        status: WorkflowStatus.ACTIVE,
        ownerId: ruby.id,
      },
    }),
    prisma.workflow.create({
      data: {
        name: 'Incident Response',
        description: 'Operational incident triage and routing',
        type: WorkflowType.STANDARD,
        status: WorkflowStatus.INACTIVE,
        ownerId: adrian.id,
      },
    }),
  ]);

  const [vendorWorkflow, boomerangWorkflow, incidentWorkflow] = workflows;

  const schemaVersions = await prisma.$transaction([
    prisma.workflowSchemaVersion.create({
      data: {
        workflowId: vendorWorkflow.id,
        version: 1,
        schemaJson: { fields: ['vendor_name', 'contact', 'services', 'risk_level'] },
      },
    }),
    prisma.workflowSchemaVersion.create({
      data: {
        workflowId: boomerangWorkflow.id,
        version: 1,
        schemaJson: { fields: ['employee', 'trip_dates', 'cost_center', 'budget'] },
      },
    }),
    prisma.workflowSchemaVersion.create({
      data: {
        workflowId: incidentWorkflow.id,
        version: 1,
        schemaJson: { fields: ['severity', 'system', 'impact', 'owner'] },
      },
    }),
  ]);

  await prisma.workflow.update({
    where: { id: vendorWorkflow.id },
    data: { currentSchemaVersionId: schemaVersions[0].id },
  });
  await prisma.workflow.update({
    where: { id: boomerangWorkflow.id },
    data: { currentSchemaVersionId: schemaVersions[1].id },
  });
  await prisma.workflow.update({
    where: { id: incidentWorkflow.id },
    data: { currentSchemaVersionId: schemaVersions[2].id },
  });

  const submissions = await prisma.$transaction([
    prisma.submission.create({
      data: {
        workflowId: boomerangWorkflow.id,
        submittedById: ruby.id,
        sourceChannel: 'boomerang',
        fileName: null,
        rawPayload: { employee: 'Rudolph', trip_dates: '2026-04-12 to 2026-04-16', cost_center: 'OPS-42', budget: 2400 },
        normalizedPayload: { employee: 'Rudolph', destination: 'NYC', approvals: [] },
        validationStatus: SubmissionValidationStatus.VALIDATED,
        validationSummary: { steps: ['schema-pass'] },
        submittedAt: new Date(),
        processedAt: new Date(),
      },
    }),
    prisma.submission.create({
      data: {
        workflowId: boomerangWorkflow.id,
        submittedById: adrian.id,
        sourceChannel: 'telegram',
        fileName: null,
        rawPayload: { employee: 'Adrian', trip_dates: '2026-05-01 to 2026-05-05', cost_center: 'OPS-01', budget: 1800 },
        validationStatus: SubmissionValidationStatus.PENDING,
      },
    }),
    prisma.submission.create({
      data: {
        workflowId: boomerangWorkflow.id,
        submittedById: ruby.id,
        sourceChannel: 'web',
        fileName: 'travel_request.json',
        rawPayload: { employee: 'Ruby', trip_dates: '2026-06-01 to 2026-06-03', cost_center: 'OPS-09', budget: 950 },
        validationStatus: SubmissionValidationStatus.VALIDATED,
        processedAt: new Date(),
        normalizedPayload: { employee: 'Ruby', destination: 'SFO', approvals: ['Rudolph'] },
      },
    }),
    prisma.submission.create({
      data: {
        workflowId: boomerangWorkflow.id,
        submittedById: adrian.id,
        sourceChannel: 'api',
        rawPayload: { employee: 'Contractor', trip_dates: '2026-04-20 to 2026-04-22', cost_center: 'OPS-55', budget: 1200 },
        validationStatus: SubmissionValidationStatus.REJECTED,
        validationSummary: { errors: ['budget_exceeded'] },
      },
    }),
  ]);

  const tasks = await prisma.$transaction([
    prisma.task.create({
      data: { title: 'Review vendor security questionnaire', workflowId: vendorWorkflow.id, status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, ownerId: adrian.id },
    }),
    prisma.task.create({
      data: { title: 'Assign travel approver', workflowId: boomerangWorkflow.id, status: TaskStatus.TODO, priority: TaskPriority.MEDIUM, ownerId: ruby.id, dueAt: new Date(Date.now() + 1000 * 60 * 60 * 24) },
    }),
    prisma.task.create({
      data: { title: 'Sync cost center mapping', workflowId: boomerangWorkflow.id, status: TaskStatus.BLOCKED, priority: TaskPriority.CRITICAL },
    }),
    prisma.task.create({
      data: { title: 'Dispatch-Bot integration stub', workflowId: incidentWorkflow.id, status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH },
    }),
    prisma.task.create({
      data: { title: 'Publish incident comms template', workflowId: incidentWorkflow.id, status: TaskStatus.DONE, priority: TaskPriority.MEDIUM },
    }),
    prisma.task.create({
      data: { title: 'QA boomerang form validation', workflowId: boomerangWorkflow.id, status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH },
    }),
    prisma.task.create({
      data: { title: 'Update webhook secrets', workflowId: vendorWorkflow.id, status: TaskStatus.TODO, priority: TaskPriority.MEDIUM },
    }),
    prisma.task.create({
      data: { title: 'Map Paperclip outputs to runs', workflowId: boomerangWorkflow.id, status: TaskStatus.TODO, priority: TaskPriority.HIGH },
    }),
  ]);

  const runs = await prisma.$transaction([
    prisma.run.create({
      data: {
        workflowId: boomerangWorkflow.id,
        submissionId: submissions[0].id,
        type: 'approval_flow',
        sourceSystem: 'boomerang',
        status: RunStatus.RUNNING,
        startedAt: new Date(),
        metadata: { stage: 'manager_review' },
      },
    }),
    prisma.run.create({
      data: {
        workflowId: vendorWorkflow.id,
        type: 'webhook_dispatch',
        sourceSystem: 'openclaw',
        status: RunStatus.SUCCESS,
        startedAt: new Date(Date.now() - 1000 * 60 * 60),
        completedAt: new Date(),
        metadata: { target: 'slack' },
      },
    }),
    prisma.run.create({
      data: {
        workflowId: boomerangWorkflow.id,
        type: 'autonomous_execution',
        sourceSystem: 'paperclip_festival',
        status: RunStatus.QUEUED,
        taskId: tasks[3].id,
        metadata: { plan: 'dispatch-bot-handshake' },
      },
    }),
    prisma.run.create({
      data: {
        workflowId: incidentWorkflow.id,
        type: 'autonomous_execution',
        sourceSystem: 'paperclip_festival',
        status: RunStatus.FAILED,
        errorMessage: 'Execution unavailable: waiting for Dispatch-Bot bridge',
        metadata: { externalRunId: 'dbot-1234' },
      },
    }),
    prisma.run.create({
      data: {
        workflowId: boomerangWorkflow.id,
        type: 'boomerang_validation',
        sourceSystem: 'boomerang',
        status: RunStatus.SUCCESS,
        taskId: tasks[5].id,
        startedAt: new Date(Date.now() - 1000 * 60 * 15),
        completedAt: new Date(Date.now() - 1000 * 60 * 5),
      },
    }),
  ]);

  const approvals = await prisma.$transaction([
    prisma.approval.create({
      data: {
        workflowId: boomerangWorkflow.id,
        taskId: tasks[1].id,
        requestedById: ruby.id,
        status: ApprovalDecision.REQUESTED,
        reason: 'Travel budget requires manager review',
      },
    }),
    prisma.approval.create({
      data: {
        workflowId: vendorWorkflow.id,
        taskId: tasks[0].id,
        requestedById: adrian.id,
        decidedById: ruby.id,
        status: ApprovalDecision.APPROVED,
        decidedAt: new Date(),
        reason: 'Security questionnaire approved',
      },
    }),
    prisma.approval.create({
      data: {
        workflowId: incidentWorkflow.id,
        requestedById: adrian.id,
        status: ApprovalDecision.DENIED,
        decidedById: ruby.id,
        decidedAt: new Date(),
        reason: 'Need incident severity before auto-run',
      },
    }),
  ]);

  const connectors = await prisma.$transaction([
    prisma.connector.create({
      data: {
        name: 'GitHub',
        type: 'github',
        status: ConnectorStatus.CONNECTED,
        config: { repo: 'nuriy/mothership' },
        workflowId: vendorWorkflow.id,
      },
    }),
    prisma.connector.create({
      data: {
        name: 'Telegram',
        type: 'telegram',
        status: ConnectorStatus.DISCONNECTED,
        config: { bot: 'openclaw_ops_bot' },
        workflowId: boomerangWorkflow.id,
      },
    }),
  ]);

  const commands = await prisma.$transaction([
    prisma.command.create({
      data: {
        input: 'dispatch incident summary',
        sourceChannel: 'telegram',
        requestedById: adrian.id,
        status: CommandStatus.COMPLETED,
        runId: runs[1].id,
        completedAt: new Date(),
      },
    }),
    prisma.command.create({
      data: {
        input: 'boomerang status travel approvals',
        sourceChannel: 'web',
        requestedById: ruby.id,
        status: CommandStatus.EXECUTING,
      },
    }),
    prisma.command.create({
      data: {
        input: 'sync dispatch-bot run dbot-1234',
        sourceChannel: 'api',
        status: CommandStatus.RECEIVED,
      },
    }),
  ]);

  const auditEventsPayload = [
    { entityType: 'workflow', entityId: vendorWorkflow.id, eventType: 'created', actorId: adrian.id },
    { entityType: 'workflow', entityId: boomerangWorkflow.id, eventType: 'created', actorId: ruby.id },
    { entityType: 'workflow', entityId: incidentWorkflow.id, eventType: 'created', actorId: adrian.id },
    { entityType: 'submission', entityId: submissions[0].id, eventType: 'validated', actorId: ruby.id },
    { entityType: 'submission', entityId: submissions[1].id, eventType: 'pending_validation', actorId: adrian.id },
    { entityType: 'run', entityId: runs[0].id, eventType: 'started', actorId: adrian.id },
    { entityType: 'run', entityId: runs[1].id, eventType: 'completed', actorId: adrian.id },
    { entityType: 'run', entityId: runs[2].id, eventType: 'queued', actorId: adrian.id },
    { entityType: 'run', entityId: runs[3].id, eventType: 'failed', actorId: adrian.id, metadata: { reason: 'dispatch-bot bridge missing' } },
    { entityType: 'task', entityId: tasks[0].id, eventType: 'status_change', actorId: adrian.id, metadata: { status: TaskStatus.IN_PROGRESS } },
    { entityType: 'task', entityId: tasks[1].id, eventType: 'created', actorId: ruby.id },
    { entityType: 'approval', entityId: approvals[0].id, eventType: 'requested', actorId: ruby.id },
    { entityType: 'approval', entityId: approvals[1].id, eventType: 'approved', actorId: ruby.id },
    { entityType: 'connector', entityId: connectors[0].id, eventType: 'connected', actorId: adrian.id },
    { entityType: 'command', entityId: commands[0].id, eventType: 'completed', actorId: adrian.id },
  ];

  for (const event of auditEventsPayload) {
    await prisma.auditEvent.create({ data: { ...event, createdAt: new Date(), metadata: event.metadata ?? {} } });
  }

  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
