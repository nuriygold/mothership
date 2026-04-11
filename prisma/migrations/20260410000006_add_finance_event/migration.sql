-- CreateTable
CREATE TABLE "FinanceEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceEvent_pkey" PRIMARY KEY ("id")
);
