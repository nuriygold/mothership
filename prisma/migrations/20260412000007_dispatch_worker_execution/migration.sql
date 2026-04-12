-- AlterEnum: add QUEUED and SCHEDULED to DispatchCampaignStatus
ALTER TYPE "DispatchCampaignStatus" ADD VALUE 'QUEUED';
ALTER TYPE "DispatchCampaignStatus" ADD VALUE 'SCHEDULED';

-- AlterTable: add queuedAt and scheduledAt to DispatchCampaign
ALTER TABLE "DispatchCampaign" ADD COLUMN "queuedAt" TIMESTAMP(3);
ALTER TABLE "DispatchCampaign" ADD COLUMN "scheduledAt" TIMESTAMP(3);

-- AlterTable: add agentId and output to DispatchTask
ALTER TABLE "DispatchTask" ADD COLUMN "agentId" TEXT;
ALTER TABLE "DispatchTask" ADD COLUMN "output" TEXT;
