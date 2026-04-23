-- AlterTable: add output-folder and related fields to DispatchCampaign
ALTER TABLE "DispatchCampaign"
  ADD COLUMN "outputFolder"  TEXT,
  ADD COLUMN "assignedBotId" TEXT,
  ADD COLUMN "revenueStream" TEXT,
  ADD COLUMN "linkedTaskRef" TEXT;
