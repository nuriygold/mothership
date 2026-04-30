CREATE TABLE "Account" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"balance" double precision DEFAULT 0 NOT NULL,
	"liquid" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AgentInboxItem" (
	"id" text PRIMARY KEY NOT NULL,
	"agentKey" text NOT NULL,
	"note" text NOT NULL,
	"source" text DEFAULT 'email' NOT NULL,
	"bucket" text,
	"emailIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"emailSummaries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"handledAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Approval" (
	"id" text PRIMARY KEY NOT NULL,
	"workflowId" text,
	"taskId" text,
	"requestedById" text,
	"decidedById" text,
	"status" text DEFAULT 'REQUESTED' NOT NULL,
	"reason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"decidedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "AuditEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"eventType" text NOT NULL,
	"actorId" text,
	"metadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "BudgetCategory" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthlyTarget" double precision NOT NULL,
	"emoji" text,
	CONSTRAINT "BudgetCategory_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ChatMessage" (
	"id" text PRIMARY KEY NOT NULL,
	"sessionId" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ChatSession" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Command" (
	"id" text PRIMARY KEY NOT NULL,
	"input" text NOT NULL,
	"sourceChannel" text NOT NULL,
	"requestedById" text,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"runId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "Connector" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'DISCONNECTED' NOT NULL,
	"config" jsonb,
	"workflowId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DispatchCampaign" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"costBudgetCents" integer,
	"timeBudgetSeconds" integer,
	"callbackUrl" text,
	"callbackSecret" text,
	"latestPlan" jsonb,
	"latestPlanCreatedAt" timestamp with time zone,
	"approvedPlanName" text,
	"approvedPlanAt" timestamp with time zone,
	"visionItemId" text,
	"projectId" text,
	"outputFolder" text,
	"assignedBotId" text,
	"revenueStream" text,
	"linkedTaskRef" text,
	"queuedAt" timestamp with time zone,
	"scheduledAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "DispatchTask" (
	"id" text PRIMARY KEY NOT NULL,
	"campaignId" text NOT NULL,
	"title" text NOT NULL,
	"key" text,
	"description" text,
	"priority" integer DEFAULT 5 NOT NULL,
	"dependencies" jsonb,
	"toolRequirements" jsonb,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"agentId" text,
	"output" text,
	"reviewOutput" text,
	"errorMessage" text,
	"toolTurns" integer,
	"taskPoolIssueNumber" integer,
	"taskPoolIssueUrl" text,
	"startedAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "EmailAgentTriage" (
	"id" text PRIMARY KEY NOT NULL,
	"bucket" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"emailIds" jsonb NOT NULL,
	"emailSummaries" jsonb NOT NULL,
	"agentName" text NOT NULL,
	"recommendation" text NOT NULL,
	"actionLabel" text NOT NULL,
	"actionPayload" jsonb,
	"approvedAt" timestamp with time zone,
	"deniedAt" timestamp with time zone,
	"executedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "EmailDraftSuggestion" (
	"id" text PRIMARY KEY NOT NULL,
	"emailExternalId" text NOT NULL,
	"tone" text NOT NULL,
	"body" text NOT NULL,
	"source" text NOT NULL,
	"approvedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "FinanceEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"source" text NOT NULL,
	"payload" jsonb NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "FinancePlan" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'CUSTOM' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"description" text,
	"goal" text,
	"currentValue" double precision,
	"targetValue" double precision,
	"unit" text,
	"startDate" timestamp with time zone,
	"targetDate" timestamp with time zone,
	"managedByBot" text DEFAULT 'adrian' NOT NULL,
	"milestones" jsonb,
	"notes" text,
	"sourceFile" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "IncomeSource" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"amount" double precision NOT NULL,
	"interval" text NOT NULL,
	"avgDays" integer NOT NULL,
	"lastSeenDate" timestamp with time zone NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "IncomeSource_source_unique" UNIQUE("source")
);
--> statement-breakpoint
CREATE TABLE "MerchantProfile" (
	"id" text PRIMARY KEY NOT NULL,
	"merchantName" text NOT NULL,
	"defaultCategory" text,
	"isSubscription" boolean DEFAULT false NOT NULL,
	"billingInterval" text,
	"subscriptionConfirmed" boolean DEFAULT false NOT NULL,
	"transactionCount" integer DEFAULT 0 NOT NULL,
	"lastSeen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "MerchantProfile_merchantName_unique" UNIQUE("merchantName")
);
--> statement-breakpoint
CREATE TABLE "NetWorthSnapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"assets" double precision NOT NULL,
	"liabilities" double precision NOT NULL,
	"netWorth" double precision NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "NetWorthSnapshot_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "Notification" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Payable" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor" text NOT NULL,
	"amount" double precision NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"dueDate" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"description" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "PlaidItem" (
	"id" text PRIMARY KEY NOT NULL,
	"itemId" text NOT NULL,
	"accessToken" text NOT NULL,
	"institutionName" text,
	"cursor" text,
	"status" text DEFAULT 'good' NOT NULL,
	"errorCode" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "PlaidItem_itemId_unique" UNIQUE("itemId")
);
--> statement-breakpoint
CREATE TABLE "Project" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"color" text DEFAULT 'lavender' NOT NULL,
	"icon" text DEFAULT 'folder' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "RevenueStreamStatusLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"action" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "RevenueStreamStatus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream" text NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"note" text,
	"requestedAt" timestamp with time zone,
	"lastReportAt" timestamp with time zone,
	"lastReport" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "RevenueStreamStatus_stream_unique" UNIQUE("stream")
);
--> statement-breakpoint
CREATE TABLE "Run" (
	"id" text PRIMARY KEY NOT NULL,
	"workflowId" text,
	"taskId" text,
	"type" text NOT NULL,
	"sourceSystem" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"startedAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	"metadata" jsonb,
	"errorMessage" text,
	"submissionId" text,
	CONSTRAINT "Run_taskId_unique" UNIQUE("taskId")
);
--> statement-breakpoint
CREATE TABLE "ShoppingItem" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"source" text,
	"emailId" text,
	"emailSubject" text,
	"completedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Submission" (
	"id" text PRIMARY KEY NOT NULL,
	"workflowId" text NOT NULL,
	"submittedById" text,
	"sourceChannel" text NOT NULL,
	"fileName" text,
	"rawPayload" jsonb NOT NULL,
	"normalizedPayload" jsonb,
	"validationStatus" text DEFAULT 'PENDING' NOT NULL,
	"validationSummary" jsonb,
	"submittedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"processedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "Task" (
	"id" text PRIMARY KEY NOT NULL,
	"workflowId" text,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'TODO' NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"ownerId" text,
	"assignee" text,
	"dueAt" timestamp with time zone,
	"visionItemId" text,
	"completedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"amount" double precision NOT NULL,
	"description" text,
	"category" text,
	"handledByBot" text DEFAULT 'Emerald' NOT NULL,
	"occurredAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "User_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "VisionBoard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text DEFAULT 'My Vision' NOT NULL,
	"description" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "VisionCampaignLink" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visionItemId" uuid NOT NULL,
	"campaignId" uuid NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "VisionFinancePlanLink" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visionItemId" uuid NOT NULL,
	"financePlanId" uuid NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "VisionItem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pillarId" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'DREAMING' NOT NULL,
	"targetDate" timestamp with time zone,
	"imageEmoji" text,
	"imageUrl" text,
	"notes" text,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "VisionPillar" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boardId" uuid NOT NULL,
	"label" text NOT NULL,
	"emoji" text,
	"color" text DEFAULT 'LAVENDER' NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "VisionTaskLink" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visionItemId" uuid NOT NULL,
	"taskId" uuid NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "WorkflowSchemaVersion" (
	"id" text PRIMARY KEY NOT NULL,
	"workflowId" text NOT NULL,
	"version" integer NOT NULL,
	"schemaJson" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "Workflow" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'STANDARD' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"ownerId" text NOT NULL,
	"currentSchemaVersionId" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"codename" text,
	"role" text,
	"runtime_key" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"work_item_id" uuid,
	"requested_by_agent_id" uuid,
	"approval_type" text NOT NULL,
	"risk_level" text NOT NULL,
	"requested_action" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" text,
	"rejected_by" text,
	"decision_notes" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact_validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"artifact_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"work_item_id" uuid,
	"validator_agent_id" uuid,
	"validation_status" text NOT NULL,
	"validation_notes" text,
	"validation_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"work_item_id" uuid,
	"artifact_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"path_or_url" text,
	"storage_provider" text,
	"content_summary" text,
	"content_hash" text,
	"produced_by_agent_id" uuid,
	"validation_status" text DEFAULT 'unvalidated' NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blockers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"work_item_id" uuid,
	"created_by_agent_id" uuid,
	"summary" text NOT NULL,
	"details" text,
	"severity" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"attempted_method" text,
	"failure_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fallback_attempts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required_resolution" text,
	"resolver_type" text,
	"resolver_id" text,
	"can_continue_elsewhere" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"assignment_role" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"title" text,
	"path_or_url" text,
	"description" text,
	"added_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"work_item_id" uuid,
	"artifact_id" uuid,
	"tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"campaign_type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"priority" text,
	"objective" text,
	"success_criteria" jsonb,
	"progress_mode" text,
	"progress_summary" jsonb,
	"owner_id" uuid,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"work_item_id" uuid,
	"agent_id" uuid,
	"event_type" text NOT NULL,
	"message" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"work_item_id" uuid,
	"agent_id" uuid,
	"gateway_run_id" text,
	"attempt_number" integer NOT NULL,
	"status" text DEFAULT 'started' NOT NULL,
	"execution_mode" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"input_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"fallback_used" boolean DEFAULT false NOT NULL,
	"fallback_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_directives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"work_item_id" uuid,
	"created_by" text,
	"recommended_agent_id" uuid,
	"stall_reason" text,
	"last_valid_event_id" uuid,
	"next_executable_action" text NOT NULL,
	"required_artifact_type" text,
	"required_validation" text,
	"fallback_method" text,
	"approval_required" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_work_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"parent_work_item_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"sequence_order" integer,
	"assigned_agent_id" uuid,
	"dependencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"expected_artifact_type" text,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"approval_required" boolean DEFAULT false NOT NULL,
	"approval_id" uuid,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "AgentInboxItem_agentKey_status_createdAt_idx" ON "AgentInboxItem" USING btree ("agentKey","status","createdAt");--> statement-breakpoint
CREATE INDEX "Approval_workflowId_createdAt_idx" ON "Approval" USING btree ("workflowId","createdAt");--> statement-breakpoint
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage" USING btree ("sessionId","createdAt");--> statement-breakpoint
CREATE INDEX "Command_runId_createdAt_idx" ON "Command" USING btree ("runId","createdAt");--> statement-breakpoint
CREATE INDEX "DispatchTask_campaignId_status_idx" ON "DispatchTask" USING btree ("campaignId","status");--> statement-breakpoint
CREATE INDEX "EmailAgentTriage_status_createdAt_idx" ON "EmailAgentTriage" USING btree ("status","createdAt");--> statement-breakpoint
CREATE INDEX "FinanceEvent_resolved_createdAt_idx" ON "FinanceEvent" USING btree ("resolved","createdAt");--> statement-breakpoint
CREATE INDEX "Notification_read_createdAt_idx" ON "Notification" USING btree ("read","createdAt");--> statement-breakpoint
CREATE INDEX "Payable_status_dueDate_idx" ON "Payable" USING btree ("status","dueDate");--> statement-breakpoint
CREATE INDEX "Project_sortOrder_idx" ON "Project" USING btree ("sortOrder");--> statement-breakpoint
CREATE INDEX "RevenueStreamStatusLog_stream_createdAt_idx" ON "RevenueStreamStatusLog" USING btree ("stream","createdAt");--> statement-breakpoint
CREATE INDEX "RevenueStreamStatus_stream_idx" ON "RevenueStreamStatus" USING btree ("stream");--> statement-breakpoint
CREATE INDEX "Run_startedAt_idx" ON "Run" USING btree ("startedAt");--> statement-breakpoint
CREATE INDEX "ShoppingItem_completedAt_idx" ON "ShoppingItem" USING btree ("completedAt");--> statement-breakpoint
CREATE INDEX "Submission_workflowId_submittedAt_idx" ON "Submission" USING btree ("workflowId","submittedAt");--> statement-breakpoint
CREATE INDEX "Task_completedAt_idx" ON "Task" USING btree ("completedAt");--> statement-breakpoint
CREATE INDEX "Transaction_accountId_idx" ON "Transaction" USING btree ("accountId");--> statement-breakpoint
CREATE INDEX "Transaction_occurredAt_idx" ON "Transaction" USING btree ("occurredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "VisionCampaignLink_visionItemId_campaignId_key" ON "VisionCampaignLink" USING btree ("visionItemId","campaignId");--> statement-breakpoint
CREATE INDEX "VisionCampaignLink_campaignId_idx" ON "VisionCampaignLink" USING btree ("campaignId");--> statement-breakpoint
CREATE UNIQUE INDEX "VisionFinancePlanLink_visionItemId_financePlanId_key" ON "VisionFinancePlanLink" USING btree ("visionItemId","financePlanId");--> statement-breakpoint
CREATE INDEX "VisionFinancePlanLink_financePlanId_idx" ON "VisionFinancePlanLink" USING btree ("financePlanId");--> statement-breakpoint
CREATE INDEX "VisionItem_pillarId_sortOrder_idx" ON "VisionItem" USING btree ("pillarId","sortOrder");--> statement-breakpoint
CREATE INDEX "VisionPillar_boardId_sortOrder_idx" ON "VisionPillar" USING btree ("boardId","sortOrder");--> statement-breakpoint
CREATE UNIQUE INDEX "VisionTaskLink_visionItemId_taskId_key" ON "VisionTaskLink" USING btree ("visionItemId","taskId");--> statement-breakpoint
CREATE INDEX "VisionTaskLink_taskId_idx" ON "VisionTaskLink" USING btree ("taskId");--> statement-breakpoint
CREATE UNIQUE INDEX "WorkflowSchemaVersion_workflowId_version_key" ON "WorkflowSchemaVersion" USING btree ("workflowId","version");--> statement-breakpoint
CREATE INDEX "approvals_campaign_id_idx" ON "approvals" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "approvals_work_item_id_idx" ON "approvals" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "artifact_validations_artifact_id_idx" ON "artifact_validations" USING btree ("artifact_id","checked_at");--> statement-breakpoint
CREATE INDEX "artifact_validations_campaign_id_idx" ON "artifact_validations" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "artifacts_campaign_id_idx" ON "artifacts" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "artifacts_work_item_id_idx" ON "artifacts" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "artifacts_validation_status_idx" ON "artifacts" USING btree ("validation_status");--> statement-breakpoint
CREATE INDEX "artifacts_artifact_type_idx" ON "artifacts" USING btree ("artifact_type");--> statement-breakpoint
CREATE INDEX "blockers_campaign_id_idx" ON "blockers" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "blockers_status_idx" ON "blockers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "blockers_severity_idx" ON "blockers" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "blockers_work_item_id_idx" ON "blockers" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "campaign_agents_campaign_id_idx" ON "campaign_agents" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_agents_agent_id_idx" ON "campaign_agents" USING btree ("agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_agents_unique_role_idx" ON "campaign_agents" USING btree ("campaign_id","agent_id","assignment_role");--> statement-breakpoint
CREATE INDEX "campaign_sources_campaign_id_idx" ON "campaign_sources" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_sources_source_type_idx" ON "campaign_sources" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "campaign_tags_campaign_id_idx" ON "campaign_tags" USING btree ("campaign_id","tag");--> statement-breakpoint
CREATE INDEX "campaign_tags_work_item_id_idx" ON "campaign_tags" USING btree ("work_item_id","tag");--> statement-breakpoint
CREATE INDEX "campaign_tags_artifact_id_idx" ON "campaign_tags" USING btree ("artifact_id","tag");--> statement-breakpoint
CREATE INDEX "campaign_tags_tag_idx" ON "campaign_tags" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaigns_campaign_type_idx" ON "campaigns" USING btree ("campaign_type");--> statement-breakpoint
CREATE INDEX "campaigns_priority_idx" ON "campaigns" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "campaigns_created_at_idx" ON "campaigns" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "campaigns_owner_id_idx" ON "campaigns" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "campaign_events_campaign_id_idx" ON "campaign_events" USING btree ("campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "campaign_events_created_at_idx" ON "campaign_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "campaign_events_event_type_idx" ON "campaign_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "campaign_events_work_item_id_idx" ON "campaign_events" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "execution_attempts_campaign_id_idx" ON "execution_attempts" USING btree ("campaign_id","started_at");--> statement-breakpoint
CREATE INDEX "execution_attempts_status_idx" ON "execution_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "execution_attempts_work_item_id_idx" ON "execution_attempts" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "resume_directives_campaign_id_idx" ON "resume_directives" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "resume_directives_status_idx" ON "resume_directives" USING btree ("status");--> statement-breakpoint
CREATE INDEX "resume_directives_work_item_id_idx" ON "resume_directives" USING btree ("work_item_id");--> statement-breakpoint
CREATE INDEX "campaign_work_items_campaign_id_idx" ON "campaign_work_items" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_work_items_status_idx" ON "campaign_work_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "campaign_work_items_assigned_agent_idx" ON "campaign_work_items" USING btree ("assigned_agent_id");--> statement-breakpoint
CREATE INDEX "campaign_work_items_parent_idx" ON "campaign_work_items" USING btree ("parent_work_item_id");--> statement-breakpoint
CREATE INDEX "campaign_work_items_campaign_sequence_idx" ON "campaign_work_items" USING btree ("campaign_id","sequence_order");