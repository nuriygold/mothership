-- CreateTable
CREATE TABLE "AgentInboxItem" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'email',
    "bucket" TEXT,
    "emailIds" JSONB NOT NULL DEFAULT '[]',
    "emailSummaries" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentInboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentInboxItem_agentKey_status_createdAt_idx" ON "AgentInboxItem"("agentKey", "status", "createdAt");
