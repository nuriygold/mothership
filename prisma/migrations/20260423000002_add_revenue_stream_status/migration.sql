CREATE TABLE "RevenueStreamStatus" (
    "id"          TEXT         NOT NULL,
    "stream"      TEXT         NOT NULL,
    "status"      TEXT         NOT NULL DEFAULT 'idle',
    "note"        TEXT,
    "requestedAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueStreamStatus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RevenueStreamStatus_stream_key" ON "RevenueStreamStatus"("stream");
CREATE INDEX "RevenueStreamStatus_stream_idx" ON "RevenueStreamStatus"("stream");
