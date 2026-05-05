// =============================================================================
// Drizzle bindings for the canonical Dispatch / Mission Control schema.
// Tables defined in scripts/000_dispatch_schema.sql.
//
// These exports are namespaced with `mc` (mission control) to avoid colliding
// with legacy schema exports (e.g. the existing `approvals` mapped to the
// `Approval` table). Application code that targets the new generic schema
// should import these by their `mc*` names.
//
// Postgres status enums are modeled as `text` with CHECK constraints in SQL,
// so TypeScript callers should use the string literal unions exported below
// for compile-time safety.
// =============================================================================

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { JsonValue } from './json';

// ── Status / type literal unions (mirrors of the SQL CHECK constraints) ──────
export type CampaignType =
  | 'data_operation'
  | 'content_pipeline'
  | 'task_orchestration'
  | 'product_development'
  | 'research'
  | 'finance_audit'
  | 'document_processing'
  | 'integration_workflow'
  | 'general_execution';

export type CampaignStatus =
  | 'draft'
  | 'approved'
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'blocked'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'archived';

export type CampaignPriority = 'low' | 'medium' | 'high' | 'critical';

export type ProgressMode =
  | 'work_item_completion'
  | 'artifact_completion'
  | 'event_milestone'
  | 'checklist'
  | 'manual_status'
  | 'external_signal'
  | 'mixed';

export type WorkItemStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'waiting_for_approval'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type AgentStatus = 'active' | 'inactive' | 'unavailable' | 'deprecated';

export type AssignmentRole =
  | 'owner'
  | 'executor'
  | 'reviewer'
  | 'validator'
  | 'supervisor'
  | 'fallback'
  | 'observer';

export type ArtifactType =
  | 'markdown'
  | 'document'
  | 'spreadsheet'
  | 'image'
  | 'video'
  | 'dataset'
  | 'source'
  | 'audit_record'
  | 'task_list'
  | 'code'
  | 'external_link'
  | 'note'
  | 'log'
  | 'other';

export type ValidationStatus =
  | 'unvalidated'
  | 'valid'
  | 'invalid'
  | 'stale'
  | 'incomplete'
  | 'needs_review';

export type EventType =
  | 'campaign_created'
  | 'campaign_updated'
  | 'campaign_approved'
  | 'campaign_queued'
  | 'campaign_started'
  | 'campaign_paused'
  | 'campaign_resumed'
  | 'campaign_cancelled'
  | 'campaign_completed'
  | 'campaign_failed'
  | 'agent_assigned'
  | 'work_item_created'
  | 'work_item_started'
  | 'work_item_completed'
  | 'artifact_created'
  | 'artifact_updated'
  | 'artifact_validated'
  | 'blocker_created'
  | 'blocker_resolved'
  | 'approval_requested'
  | 'approval_granted'
  | 'approval_rejected'
  | 'execution_started'
  | 'execution_progress'
  | 'execution_resumed'
  | 'execution_failed'
  | 'watchdog_stall_detected'
  | 'resume_directive_created';

export type BlockerStatus = 'open' | 'in_review' | 'resolved' | 'dismissed' | 'stale';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type ResolverType =
  | 'user'
  | 'agent'
  | 'builder'
  | 'gateway'
  | 'external_system'
  | 'unknown';

export type ApprovalType =
  | 'external_post'
  | 'purchase'
  | 'deletion'
  | 'financial_action'
  | 'customer_contact'
  | 'public_content'
  | 'database_mutation'
  | 'file_overwrite'
  | 'sensitive_data_use'
  | 'generic_risk';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';

export type ExecutionStatus =
  | 'started'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'stalled'
  | 'cancelled'
  | 'resumed';

export type ExecutionMode =
  | 'api'
  | 'cli'
  | 'browser'
  | 'file_operation'
  | 'database'
  | 'manual_approval'
  | 'agent_handoff'
  | 'mixed';

export type DirectiveStatus = 'open' | 'consumed' | 'superseded' | 'dismissed' | 'completed';

export type SourceType =
  | 'document'
  | 'url'
  | 'file'
  | 'dataset'
  | 'repository'
  | 'screenshot'
  | 'email'
  | 'calendar'
  | 'database_record'
  | 'external_system'
  | 'manual_note'
  | 'other';

// ── Tables ──────────────────────────────────────────────────────────────────

export const mcAgents = pgTable('agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  codename: text('codename'),
  role: text('role'),
  runtimeKey: text('runtime_key'),
  capabilities: jsonb('capabilities').$type<JsonValue>().notNull().default([]),
  status: text('status').$type<AgentStatus>().notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb('metadata').$type<JsonValue>().notNull().default({}),
});

export const mcCampaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    campaignType: text('campaign_type').$type<CampaignType>().notNull(),
    status: text('status').$type<CampaignStatus>().notNull().default('draft'),
    priority: text('priority').$type<CampaignPriority>(),
    objective: text('objective'),
    successCriteria: jsonb('success_criteria').$type<JsonValue>(),
    progressMode: text('progress_mode').$type<ProgressMode>(),
    progressSummary: jsonb('progress_summary').$type<JsonValue>(),
    ownerId: uuid('owner_id'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<JsonValue>().notNull().default({}),
  },
  (t) => ({
    statusIdx: index('campaigns_status_idx').on(t.status),
    typeIdx: index('campaigns_campaign_type_idx').on(t.campaignType),
    priorityIdx: index('campaigns_priority_idx').on(t.priority),
    createdAtIdx: index('campaigns_created_at_idx').on(t.createdAt),
    ownerIdx: index('campaigns_owner_id_idx').on(t.ownerId),
  })
);

export const mcCampaignAgents = pgTable(
  'campaign_agents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id').notNull(),
    agentId: uuid('agent_id').notNull(),
    assignmentRole: text('assignment_role').$type<AssignmentRole>(),
    isPrimary: boolean('is_primary').notNull().default(false),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').$type<JsonValue>().notNull().default({}),
  },
  (t) => ({
    campaignIdx: index('campaign_agents_campaign_id_idx').on(t.campaignId),
    agentIdx: index('campaign_agents_agent_id_idx').on(t.agentId),
    uniqueRole: uniqueIndex('campaign_agents_unique_role_idx').on(
      t.campaignId,
      t.agentId,
      t.assignmentRole,
    ),
  })
);

export const mcWorkItems = pgTable(
  'campaign_work_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id').notNull(),
    parentWorkItemId: uuid('parent_work_item_id'),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').$type<WorkItemStatus>().notNull().default('pending'),
    sequenceOrder: integer('sequence_order'),
    assignedAgentId: uuid('assigned_agent_id'),
    dependencies: jsonb('dependencies').$type<JsonValue>().notNull().default([]),
    expectedArtifactType: text('expected_artifact_type'),
    riskLevel: text('risk_level').$type<Severity>().notNull().default('low'),
    approvalRequired: boolean('approval_required').notNull().default(false),
    approvalId: uuid('approval_id'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').$type<JsonValue>().notNull().default({}),
  },
  (t) => ({
    campaignIdx: index('campaign_work_items_campaign_id_idx').on(t.campaignId),
    statusIdx: index('campaign_work_items_status_idx').on(t.status),
    assignedAgentIdx: index('campaign_work_items_assigned_agent_idx').on(t.assignedAgentId),
    parentIdx: index('campaign_work_items_parent_idx').on(t.parentWorkItemId),
    sequenceIdx: index('campaign_work_items_campaign_sequence_idx').on(t.campaignId, t.sequenceOrder),
  })
);

export const mcArtifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id').notNull(),
    workItemId: uuid('work_item_id'),
    artifactType: text('artifact_type').$type<ArtifactType>().notNull(),
    title: text('title').notNull(),
    description: text('description'),
    pathOrUrl: text('path_or_url'),
    storageProvider: text('storage_provider'),
    contentSummary: text('content_summary'),
    contentHash: text('content_hash'),
    producedByAgentId: uuid('produced_by_agent_id'),
    validationStatus: text('validation_status').$type<ValidationStatus>().notNull().default('unvalidated'),
    currentVersion: integer('current_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').$type<JsonValue>().notNull().default({}),
  },
  (t) => ({
    campaignIdx: index('artifacts_campaign_id_idx').on(t.campaignId),
    workItemIdx: index('artifacts_work_item_id_idx').on(t.workItemId),
    validationIdx: index('artifacts_validation_status_idx').on(t.validationStatus),
    typeIdx: index('artifacts_artifact_type_idx').on(t.artifactType),
  })
);

export const mcArtifactValidations = pgTable(
  'artifact_validations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    artifactId: uuid('artifact_id').notNull(),
    campaignId: uuid('campaign_id').notNull(),
    workItemId: uuid('work_item_id'),
    validatorAgentId: uuid('validator_agent_id'),
    validationStatus: text('validation_status').$type<ValidationStatus>().notNull(),
    validationNotes: text('validation_notes'),
    validationEvidence: jsonb('validation_evidence').$type<JsonValue>().notNull().default({}),
    checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').$type<JsonValue>().notNull().default({}),
  },
  (t) => ({
    artifactIdx: index('artifact_validations_artifact_id_idx').on(t.artifactId, t.checkedAt),
    campaignIdx: index('artifact_validations_campaign_id_idx').on(t.campaignId),
  })
);

export const mcEvents = pgTable(
  'campaign_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id').notNull(),
    workItemId: uuid('work_item_id'),
    agentId: uuid('agent_id'),
    eventType: text('event_type').$type<EventType>().notNull(),
    message: text('message'),
    payload: jsonb('payload').$type<JsonValue>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    campaignIdx: index('campaign_events_campaign_id_idx').on(t.campaignId, t.createdAt),
    createdAtIdx: index('campaign_events_created_at_idx').on(t.createdAt),
    typeIdx: index('campaign_events_event_type_idx').on(t.eventType),
    workItemIdx: index('campaign_events_work_item_id_idx').on(t.workItemId),
  })
);

export const mcBlockers = pgTable(
  'blockers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id').notNull(),
    workItemId: uuid('work_item_id'),
    createdByAgentId: uuid('created_by_agent_id'),
    summary: text('summary').notNull(),
    details: text('details'),
    severity: text('severity').$type<Severity>().notNull().default('medium'),
    status: text('status').$type<BlockerStatus>().notNull().default('open'),
    attemptedMethod: text('attempted_method'),
    failureEvidence: jsonb('failure_evidence').$type<JsonValue>().notNull().default({}),
    fallbackAttempts: jsonb('fallback_attempts').$type<JsonValue>().notNull().default([]),
    requiredResolution: text('required_resolution'),
    resolverType: text('resolver_type').$type<ResolverType>(),
    resolverId: text('resolver_id'),
    canContinueElsewhere: boolean('can_continue_elsewhere').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<JsonValue>().notNull().default({}),
  },
  (t) => ({
    campaignIdx: index('blockers_campaign_id_idx').on(t.campaignId),
    statusIdx: index('blockers_status_idx').on(t.status),
    severityIdx: index('blockers_severity_idx').on(t.severity),
    workItemIdx: index('blockers_work_item_id_idx').on(t.workItemId),
  })
);

export const mcApprovals = pgTable(
  'approvals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id').notNull(),
    workItemId: uuid('work_item_id'),
    requestedByAgentId: uuid('requested_by_agent_id'),
    approvalType: text('approval_type').$type<ApprovalType>().notNull(),
    riskLevel: text('risk_level').$type<Severity>().notNull(),
    requestedAction: text('requested_action').notNull(),
    reason: text('reason'),
    status: text('status').$type<ApprovalStatus>().notNull().default('pending'),
    approvedBy: text('approved_by'),
    rejectedBy: text('rejected_by'),
    decisionNotes: text('decision_notes'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<JsonValue>().notNull().default({}),
  },
  (t) => ({
    campaignIdx: index('approvals_campaign_id_idx').on(t.campaignId),
    statusIdx: index('approvals_status_idx').on(t.status),
    workItemIdx: index('approvals_work_item_id_idx').on(t.workItemId),
  })
);

export const mcExecutionAttempts = pgTable(
  'execution_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id').notNull(),
    workItemId: uuid('work_item_id'),
    agentId: uuid('agent_id'),
    gatewayRunId: text('gateway_run_id'),
    attemptNumber: integer('attempt_number').notNull(),
    status: text('status').$type<ExecutionStatus>().notNull().default('started'),
    executionMode: text('execution_mode').$type<ExecutionMode>(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    inputPayload: jsonb('input_payload').$type<JsonValue>().notNull().default({}),
    outputPayload: jsonb('output_payload').$type<JsonValue>().notNull().default({}),
    errorMessage: text('error_message'),
    fallbackUsed: boolean('fallback_used').notNull().default(false),
    fallbackDetails: jsonb('fallback_details').$type<JsonValue>().notNull().default({}),
    metadata: jsonb('metadata').$type<JsonValue>().notNull().default({}),
  },
  (t) => ({
    campaignIdx: index('execution_attempts_campaign_id_idx').on(t.campaignId, t.startedAt),
    statusIdx: index('execution_attempts_status_idx').on(t.status),
    workItemIdx: index('execution_attempts_work_item_id_idx').on(t.workItemId),
  })
);

export const mcResumeDirectives = pgTable(
  'resume_directives',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id').notNull(),
    workItemId: uuid('work_item_id'),
    createdBy: text('created_by'),
    recommendedAgentId: uuid('recommended_agent_id'),
    stallReason: text('stall_reason'),
    lastValidEventId: uuid('last_valid_event_id'),
    nextExecutableAction: text('next_executable_action').notNull(),
    requiredArtifactType: text('required_artifact_type'),
    requiredValidation: text('required_validation'),
    fallbackMethod: text('fallback_method'),
    approvalRequired: boolean('approval_required').notNull().default(false),
    status: text('status').$type<DirectiveStatus>().notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    metadata: jsonb('metadata').$type<JsonValue>().notNull().default({}),
  },
  (t) => ({
    campaignIdx: index('resume_directives_campaign_id_idx').on(t.campaignId),
    statusIdx: index('resume_directives_status_idx').on(t.status),
    workItemIdx: index('resume_directives_work_item_id_idx').on(t.workItemId),
  })
);

export const mcCampaignSources = pgTable(
  'campaign_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id').notNull(),
    sourceType: text('source_type').$type<SourceType>().notNull(),
    title: text('title'),
    pathOrUrl: text('path_or_url'),
    description: text('description'),
    addedBy: text('added_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').$type<JsonValue>().notNull().default({}),
  },
  (t) => ({
    campaignIdx: index('campaign_sources_campaign_id_idx').on(t.campaignId),
    typeIdx: index('campaign_sources_source_type_idx').on(t.sourceType),
  })
);

export const mcCampaignTags = pgTable(
  'campaign_tags',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id'),
    workItemId: uuid('work_item_id'),
    artifactId: uuid('artifact_id'),
    tag: text('tag').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    campaignIdx: index('campaign_tags_campaign_id_idx').on(t.campaignId, t.tag),
    workItemIdx: index('campaign_tags_work_item_id_idx').on(t.workItemId, t.tag),
    artifactIdx: index('campaign_tags_artifact_id_idx').on(t.artifactId, t.tag),
    tagIdx: index('campaign_tags_tag_idx').on(t.tag),
  })
);

// ── Inferred row types (Select / Insert) ────────────────────────────────────
export type McAgent = typeof mcAgents.$inferSelect;
export type McAgentInsert = typeof mcAgents.$inferInsert;
export type McCampaign = typeof mcCampaigns.$inferSelect;
export type McCampaignInsert = typeof mcCampaigns.$inferInsert;
export type McCampaignAgent = typeof mcCampaignAgents.$inferSelect;
export type McCampaignAgentInsert = typeof mcCampaignAgents.$inferInsert;
export type McWorkItem = typeof mcWorkItems.$inferSelect;
export type McWorkItemInsert = typeof mcWorkItems.$inferInsert;
export type McArtifact = typeof mcArtifacts.$inferSelect;
export type McArtifactInsert = typeof mcArtifacts.$inferInsert;
export type McArtifactValidation = typeof mcArtifactValidations.$inferSelect;
export type McArtifactValidationInsert = typeof mcArtifactValidations.$inferInsert;
export type McEvent = typeof mcEvents.$inferSelect;
export type McEventInsert = typeof mcEvents.$inferInsert;
export type McBlocker = typeof mcBlockers.$inferSelect;
export type McBlockerInsert = typeof mcBlockers.$inferInsert;
export type McApproval = typeof mcApprovals.$inferSelect;
export type McApprovalInsert = typeof mcApprovals.$inferInsert;
export type McExecutionAttempt = typeof mcExecutionAttempts.$inferSelect;
export type McExecutionAttemptInsert = typeof mcExecutionAttempts.$inferInsert;
export type McResumeDirective = typeof mcResumeDirectives.$inferSelect;
export type McResumeDirectiveInsert = typeof mcResumeDirectives.$inferInsert;
export type McCampaignSource = typeof mcCampaignSources.$inferSelect;
export type McCampaignSourceInsert = typeof mcCampaignSources.$inferInsert;
export type McCampaignTag = typeof mcCampaignTags.$inferSelect;
export type McCampaignTagInsert = typeof mcCampaignTags.$inferInsert;
