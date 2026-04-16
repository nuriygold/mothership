-- CreateEnum
CREATE TYPE "EmailTriageBucket" AS ENUM ('MARKETING', 'PERSONAL', 'UPCOMING_EVENT', 'BILLS', 'OTHER');

-- CreateEnum
CREATE TYPE "EmailTriageStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXECUTED');

-- CreateTable
CREATE TABLE "EmailAgentTriage" (
    "id" TEXT NOT NULL,
    "bucket" "EmailTriageBucket" NOT NULL,
    "status" "EmailTriageStatus" NOT NULL DEFAULT 'PENDING',
    "emailIds" JSONB NOT NULL DEFAULT '[]',
    "emailSummaries" JSONB NOT NULL DEFAULT '[]',
    "agentName" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "actionLabel" TEXT NOT NULL,
    "actionPayload" JSONB,
    "approvedAt" TIMESTAMP(3),
    "deniedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAgentTriage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailAgentTriage_status_createdAt_idx" ON "EmailAgentTriage"("status", "createdAt");
