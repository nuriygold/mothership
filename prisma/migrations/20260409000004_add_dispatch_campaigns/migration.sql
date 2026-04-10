-- CreateEnum
CREATE TYPE "DispatchCampaignStatus" AS ENUM ('DRAFT', 'PLANNING', 'READY', 'EXECUTING', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DispatchTaskStatus" AS ENUM ('PLANNED', 'QUEUED', 'RUNNING', 'DONE', 'FAILED', 'PARTIAL', 'CANCELED');

-- CreateTable
CREATE TABLE "DispatchCampaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "DispatchCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "costBudgetCents" INTEGER,
    "timeBudgetSeconds" INTEGER,
    "callbackUrl" TEXT,
    "callbackSecret" TEXT,
    "latestPlan" JSONB,
    "latestPlanCreatedAt" TIMESTAMP(3),
    "approvedPlanName" TEXT,
    "approvedPlanAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchTask" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "dependencies" JSONB,
    "toolRequirements" JSONB,
    "status" "DispatchTaskStatus" NOT NULL DEFAULT 'PLANNED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DispatchTask_campaignId_status_idx" ON "DispatchTask"("campaignId", "status");

-- AddForeignKey
ALTER TABLE "DispatchTask" ADD CONSTRAINT "DispatchTask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DispatchCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
