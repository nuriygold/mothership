-- CreateEnum
CREATE TYPE "VisionPillarColor" AS ENUM ('MINT', 'LAVENDER', 'PEACH', 'SKY', 'PINK', 'LEMON');

-- CreateEnum
CREATE TYPE "VisionItemStatus" AS ENUM ('DREAMING', 'ACTIVE', 'ACHIEVED', 'ON_HOLD');

-- AlterTable: add visionItemId to DispatchCampaign
ALTER TABLE "DispatchCampaign" ADD COLUMN "visionItemId" TEXT;

-- CreateTable
CREATE TABLE "VisionBoard" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'My Vision',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisionBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionPillar" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT,
    "color" "VisionPillarColor" NOT NULL DEFAULT 'LAVENDER',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisionPillar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionItem" (
    "id" TEXT NOT NULL,
    "pillarId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "VisionItemStatus" NOT NULL DEFAULT 'DREAMING',
    "targetDate" TIMESTAMP(3),
    "imageEmoji" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionCampaignLink" (
    "id" TEXT NOT NULL,
    "visionItemId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisionCampaignLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisionFinancePlanLink" (
    "id" TEXT NOT NULL,
    "visionItemId" TEXT NOT NULL,
    "financePlanId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisionFinancePlanLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisionPillar_boardId_sortOrder_idx" ON "VisionPillar"("boardId", "sortOrder");

-- CreateIndex
CREATE INDEX "VisionItem_pillarId_sortOrder_idx" ON "VisionItem"("pillarId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "VisionCampaignLink_visionItemId_campaignId_key" ON "VisionCampaignLink"("visionItemId", "campaignId");

-- CreateIndex
CREATE INDEX "VisionCampaignLink_campaignId_idx" ON "VisionCampaignLink"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "VisionFinancePlanLink_visionItemId_financePlanId_key" ON "VisionFinancePlanLink"("visionItemId", "financePlanId");

-- CreateIndex
CREATE INDEX "VisionFinancePlanLink_financePlanId_idx" ON "VisionFinancePlanLink"("financePlanId");

-- AddForeignKey
ALTER TABLE "VisionPillar" ADD CONSTRAINT "VisionPillar_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "VisionBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionItem" ADD CONSTRAINT "VisionItem_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "VisionPillar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionCampaignLink" ADD CONSTRAINT "VisionCampaignLink_visionItemId_fkey" FOREIGN KEY ("visionItemId") REFERENCES "VisionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisionFinancePlanLink" ADD CONSTRAINT "VisionFinancePlanLink_visionItemId_fkey" FOREIGN KEY ("visionItemId") REFERENCES "VisionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
