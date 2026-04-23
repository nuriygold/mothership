-- CreateTable
CREATE TABLE "RevenueStreamStatus" (
    "id" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "note" TEXT,
    "requestedAt" TIMESTAMP(3),
    "lastReportAt" TIMESTAMP(3),
    "lastReport" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueStreamStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueStreamStatusLog" (
    "id" TEXT NOT NULL,
    "stream" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "action" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueStreamStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "RevenueStreamStatus_stream_key" ON "RevenueStreamStatus"("stream");

-- CreateIndex
CREATE INDEX "RevenueStreamStatus_stream_idx" ON "RevenueStreamStatus"("stream");

-- CreateIndex
CREATE INDEX "RevenueStreamStatusLog_stream_createdAt_idx" ON "RevenueStreamStatusLog"("stream", "createdAt");
