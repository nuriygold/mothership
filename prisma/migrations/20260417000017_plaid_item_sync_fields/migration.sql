-- AlterTable
ALTER TABLE "PlaidItem"
  ADD COLUMN "cursor"    TEXT,
  ADD COLUMN "status"    TEXT NOT NULL DEFAULT 'good',
  ADD COLUMN "errorCode" TEXT;
