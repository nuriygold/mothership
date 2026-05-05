BEGIN;

CREATE TABLE IF NOT EXISTS "AgentInboxItem" (
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
CREATE TABLE IF NOT EXISTS "ChatSession" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
CREATE TABLE IF NOT EXISTS "EmailDraftSuggestion" (
	"id" text PRIMARY KEY NOT NULL,
	"emailExternalId" text NOT NULL,
	"tone" text NOT NULL,
	"body" text NOT NULL,
	"source" text NOT NULL,
	"approvedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "Notification" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "RevenueStreamStatusLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stream" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"action" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "RevenueStreamStatus" (
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
CREATE TABLE IF NOT EXISTS "ShoppingItem" (
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

INSERT INTO "ChatSession" ("id", "title", "createdAt", "updatedAt")
SELECT
	"sessionId",
	NULL,
	MIN("createdAt") AT TIME ZONE 'UTC',
	MAX("createdAt") AT TIME ZONE 'UTC'
FROM "ChatMessage"
GROUP BY "sessionId"
ON CONFLICT ("id") DO NOTHING;

CREATE INDEX IF NOT EXISTS "AgentInboxItem_agentKey_status_createdAt_idx" ON "AgentInboxItem" USING btree ("agentKey","status","createdAt");
CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage" USING btree ("sessionId","createdAt");
CREATE INDEX IF NOT EXISTS "EmailAgentTriage_status_createdAt_idx" ON "EmailAgentTriage" USING btree ("status","createdAt");
CREATE INDEX IF NOT EXISTS "Notification_read_createdAt_idx" ON "Notification" USING btree ("read","createdAt");
CREATE INDEX IF NOT EXISTS "RevenueStreamStatusLog_stream_createdAt_idx" ON "RevenueStreamStatusLog" USING btree ("stream","createdAt");
CREATE INDEX IF NOT EXISTS "RevenueStreamStatus_stream_idx" ON "RevenueStreamStatus" USING btree ("stream");
CREATE INDEX IF NOT EXISTS "ShoppingItem_completedAt_idx" ON "ShoppingItem" USING btree ("completedAt");

ALTER TABLE "Transaction" DROP CONSTRAINT IF EXISTS "Transaction_accountId_fkey";
ALTER TABLE "VisionCampaignLink" DROP CONSTRAINT IF EXISTS "VisionCampaignLink_visionItemId_fkey";
ALTER TABLE "VisionFinancePlanLink" DROP CONSTRAINT IF EXISTS "VisionFinancePlanLink_visionItemId_fkey";
ALTER TABLE "VisionItem" DROP CONSTRAINT IF EXISTS "VisionItem_pillarId_fkey";
ALTER TABLE "VisionPillar" DROP CONSTRAINT IF EXISTS "VisionPillar_boardId_fkey";
ALTER TABLE "VisionTaskLink" DROP CONSTRAINT IF EXISTS "VisionTaskLink_visionItemId_fkey";

UPDATE "Account"
SET
	"currency" = COALESCE("currency", 'USD'),
	"balance" = COALESCE("balance", 0),
	"createdAt" = COALESCE("createdAt", now()),
	"updatedAt" = COALESCE("updatedAt", COALESCE("createdAt", now()));

UPDATE "Payable"
SET
	"currency" = COALESCE("currency", 'USD'),
	"status" = COALESCE("status", 'pending'),
	"createdAt" = COALESCE("createdAt", now()),
	"updatedAt" = COALESCE("updatedAt", COALESCE("createdAt", now()));

UPDATE "Transaction"
SET
	"occurredAt" = COALESCE("occurredAt", now()),
	"createdAt" = COALESCE("createdAt", now());

UPDATE "VisionBoard"
SET "updatedAt" = COALESCE("updatedAt", COALESCE("createdAt", now()));

UPDATE "VisionItem"
SET "updatedAt" = COALESCE("updatedAt", COALESCE("createdAt", now()));

UPDATE "VisionPillar"
SET "updatedAt" = COALESCE("updatedAt", COALESCE("createdAt", now()));

ALTER TABLE "Account"
	ALTER COLUMN "id" DROP DEFAULT,
	ALTER COLUMN "id" TYPE text USING "id"::text,
	ALTER COLUMN "currency" SET NOT NULL,
	ALTER COLUMN "balance" SET NOT NULL,
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "createdAt" SET NOT NULL,
	ALTER COLUMN "updatedAt" DROP DEFAULT,
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Approval"
	ALTER COLUMN "status" DROP DEFAULT,
	ALTER COLUMN "status" TYPE text USING "status"::text,
	ALTER COLUMN "status" SET DEFAULT 'REQUESTED',
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "decidedAt" TYPE timestamp with time zone USING CASE WHEN "decidedAt" IS NULL THEN NULL ELSE "decidedAt" AT TIME ZONE 'UTC' END;

ALTER TABLE "AuditEvent"
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "ChatMessage"
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "Command"
	ALTER COLUMN "status" DROP DEFAULT,
	ALTER COLUMN "status" TYPE text USING "status"::text,
	ALTER COLUMN "status" SET DEFAULT 'RECEIVED',
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "completedAt" TYPE timestamp with time zone USING CASE WHEN "completedAt" IS NULL THEN NULL ELSE "completedAt" AT TIME ZONE 'UTC' END;

ALTER TABLE "Connector"
	ALTER COLUMN "status" DROP DEFAULT,
	ALTER COLUMN "status" TYPE text USING "status"::text,
	ALTER COLUMN "status" SET DEFAULT 'DISCONNECTED',
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "DispatchCampaign"
	ALTER COLUMN "status" DROP DEFAULT,
	ALTER COLUMN "status" TYPE text USING "status"::text,
	ALTER COLUMN "status" SET DEFAULT 'DRAFT',
	ALTER COLUMN "latestPlanCreatedAt" TYPE timestamp with time zone USING CASE WHEN "latestPlanCreatedAt" IS NULL THEN NULL ELSE "latestPlanCreatedAt" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "approvedPlanAt" TYPE timestamp with time zone USING CASE WHEN "approvedPlanAt" IS NULL THEN NULL ELSE "approvedPlanAt" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "queuedAt" TYPE timestamp with time zone USING CASE WHEN "queuedAt" IS NULL THEN NULL ELSE "queuedAt" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "scheduledAt" TYPE timestamp with time zone USING CASE WHEN "scheduledAt" IS NULL THEN NULL ELSE "scheduledAt" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "DispatchTask"
	ALTER COLUMN "status" DROP DEFAULT,
	ALTER COLUMN "status" TYPE text USING "status"::text,
	ALTER COLUMN "status" SET DEFAULT 'PLANNED',
	ALTER COLUMN "startedAt" TYPE timestamp with time zone USING CASE WHEN "startedAt" IS NULL THEN NULL ELSE "startedAt" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "completedAt" TYPE timestamp with time zone USING CASE WHEN "completedAt" IS NULL THEN NULL ELSE "completedAt" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "EmailAgentTriage"
	ALTER COLUMN "bucket" TYPE text USING "bucket"::text,
	ALTER COLUMN "status" DROP DEFAULT,
	ALTER COLUMN "status" TYPE text USING "status"::text,
	ALTER COLUMN "status" SET DEFAULT 'PENDING',
	ALTER COLUMN "emailIds" DROP DEFAULT,
	ALTER COLUMN "emailSummaries" DROP DEFAULT,
	ALTER COLUMN "approvedAt" TYPE timestamp with time zone USING CASE WHEN "approvedAt" IS NULL THEN NULL ELSE "approvedAt" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "deniedAt" TYPE timestamp with time zone USING CASE WHEN "deniedAt" IS NULL THEN NULL ELSE "deniedAt" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "executedAt" TYPE timestamp with time zone USING CASE WHEN "executedAt" IS NULL THEN NULL ELSE "executedAt" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "FinanceEvent"
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "FinancePlan"
	ALTER COLUMN "type" DROP DEFAULT,
	ALTER COLUMN "type" TYPE text USING "type"::text,
	ALTER COLUMN "type" SET DEFAULT 'CUSTOM',
	ALTER COLUMN "status" DROP DEFAULT,
	ALTER COLUMN "status" TYPE text USING "status"::text,
	ALTER COLUMN "status" SET DEFAULT 'ACTIVE',
	ALTER COLUMN "startDate" TYPE timestamp with time zone USING CASE WHEN "startDate" IS NULL THEN NULL ELSE "startDate" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "targetDate" TYPE timestamp with time zone USING CASE WHEN "targetDate" IS NULL THEN NULL ELSE "targetDate" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "IncomeSource"
	ALTER COLUMN "id" DROP DEFAULT,
	ALTER COLUMN "lastSeenDate" TYPE timestamp with time zone USING "lastSeenDate" AT TIME ZONE 'UTC',
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" DROP DEFAULT,
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "MerchantProfile"
	ALTER COLUMN "lastSeen" TYPE timestamp with time zone USING "lastSeen" AT TIME ZONE 'UTC';

ALTER TABLE "NetWorthSnapshot"
	ALTER COLUMN "id" DROP DEFAULT,
	ALTER COLUMN "date" TYPE timestamp with time zone USING "date"::timestamp AT TIME ZONE 'UTC',
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "Payable"
	ALTER COLUMN "currency" SET NOT NULL,
	ALTER COLUMN "dueDate" TYPE timestamp with time zone USING CASE WHEN "dueDate" IS NULL THEN NULL ELSE "dueDate" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "status" SET NOT NULL,
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "createdAt" SET NOT NULL,
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "PlaidItem"
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Project"
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Run"
	ALTER COLUMN "status" DROP DEFAULT,
	ALTER COLUMN "status" TYPE text USING "status"::text,
	ALTER COLUMN "status" SET DEFAULT 'QUEUED',
	ALTER COLUMN "startedAt" TYPE timestamp with time zone USING CASE WHEN "startedAt" IS NULL THEN NULL ELSE "startedAt" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "completedAt" TYPE timestamp with time zone USING CASE WHEN "completedAt" IS NULL THEN NULL ELSE "completedAt" AT TIME ZONE 'UTC' END;

ALTER TABLE "Submission"
	ALTER COLUMN "validationStatus" DROP DEFAULT,
	ALTER COLUMN "validationStatus" TYPE text USING "validationStatus"::text,
	ALTER COLUMN "validationStatus" SET DEFAULT 'PENDING',
	ALTER COLUMN "submittedAt" TYPE timestamp with time zone USING "submittedAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "processedAt" TYPE timestamp with time zone USING CASE WHEN "processedAt" IS NULL THEN NULL ELSE "processedAt" AT TIME ZONE 'UTC' END;

ALTER TABLE "Task"
	ALTER COLUMN "status" DROP DEFAULT,
	ALTER COLUMN "status" TYPE text USING "status"::text,
	ALTER COLUMN "status" SET DEFAULT 'TODO',
	ALTER COLUMN "priority" DROP DEFAULT,
	ALTER COLUMN "priority" TYPE text USING "priority"::text,
	ALTER COLUMN "priority" SET DEFAULT 'MEDIUM',
	ALTER COLUMN "dueAt" TYPE timestamp with time zone USING CASE WHEN "dueAt" IS NULL THEN NULL ELSE "dueAt" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "completedAt" TYPE timestamp with time zone USING CASE WHEN "completedAt" IS NULL THEN NULL ELSE "completedAt" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Transaction"
	ALTER COLUMN "id" DROP DEFAULT,
	ALTER COLUMN "id" TYPE text USING "id"::text,
	ALTER COLUMN "accountId" TYPE text USING "accountId"::text,
	ALTER COLUMN "occurredAt" TYPE timestamp with time zone USING "occurredAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "occurredAt" SET NOT NULL,
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "createdAt" SET NOT NULL;

ALTER TABLE "User"
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "VisionBoard"
	ALTER COLUMN "id" TYPE uuid USING "id"::uuid,
	ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" SET DEFAULT now();

ALTER TABLE "VisionCampaignLink"
	ALTER COLUMN "id" TYPE uuid USING "id"::uuid,
	ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
	ALTER COLUMN "visionItemId" TYPE uuid USING "visionItemId"::uuid,
	ALTER COLUMN "campaignId" TYPE uuid USING "campaignId"::uuid,
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "VisionFinancePlanLink"
	ALTER COLUMN "id" TYPE uuid USING "id"::uuid,
	ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
	ALTER COLUMN "visionItemId" TYPE uuid USING "visionItemId"::uuid,
	ALTER COLUMN "financePlanId" TYPE uuid USING "financePlanId"::uuid,
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "VisionItem"
	ALTER COLUMN "id" TYPE uuid USING "id"::uuid,
	ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
	ALTER COLUMN "pillarId" TYPE uuid USING "pillarId"::uuid,
	ALTER COLUMN "status" DROP DEFAULT,
	ALTER COLUMN "status" TYPE text USING "status"::text,
	ALTER COLUMN "status" SET DEFAULT 'DREAMING',
	ALTER COLUMN "targetDate" TYPE timestamp with time zone USING CASE WHEN "targetDate" IS NULL THEN NULL ELSE "targetDate" AT TIME ZONE 'UTC' END,
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" SET DEFAULT now();

ALTER TABLE "VisionPillar"
	ALTER COLUMN "id" TYPE uuid USING "id"::uuid,
	ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
	ALTER COLUMN "boardId" TYPE uuid USING "boardId"::uuid,
	ALTER COLUMN "color" DROP DEFAULT,
	ALTER COLUMN "color" TYPE text USING "color"::text,
	ALTER COLUMN "color" SET DEFAULT 'LAVENDER',
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" SET DEFAULT now();

ALTER TABLE "VisionTaskLink"
	ALTER COLUMN "id" TYPE uuid USING "id"::uuid,
	ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
	ALTER COLUMN "visionItemId" TYPE uuid USING "visionItemId"::uuid,
	ALTER COLUMN "taskId" TYPE uuid USING "taskId"::uuid,
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "WorkflowSchemaVersion"
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "Workflow"
	ALTER COLUMN "type" DROP DEFAULT,
	ALTER COLUMN "type" TYPE text USING "type"::text,
	ALTER COLUMN "type" SET DEFAULT 'STANDARD',
	ALTER COLUMN "status" DROP DEFAULT,
	ALTER COLUMN "status" TYPE text USING "status"::text,
	ALTER COLUMN "status" SET DEFAULT 'ACTIVE',
	ALTER COLUMN "createdAt" TYPE timestamp with time zone USING "createdAt" AT TIME ZONE 'UTC',
	ALTER COLUMN "updatedAt" TYPE timestamp with time zone USING "updatedAt" AT TIME ZONE 'UTC';

COMMIT;
