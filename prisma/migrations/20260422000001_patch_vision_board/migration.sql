-- Patch: add missing columns and tables from the vision board schema

-- Add imageUrl to VisionItem (was in schema but missing from original migration)
ALTER TABLE "VisionItem" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- Add visionItemId to Task (enables task-to-vision-item soft link)
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "visionItemId" TEXT;

-- CreateTable VisionTaskLink (was in schema but missing from original migration)
CREATE TABLE IF NOT EXISTS "VisionTaskLink" (
    "id" TEXT NOT NULL,
    "visionItemId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisionTaskLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VisionTaskLink_visionItemId_taskId_key" ON "VisionTaskLink"("visionItemId", "taskId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VisionTaskLink_taskId_idx" ON "VisionTaskLink"("taskId");

-- AddForeignKey (only if not already present — safe to run idempotently)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'VisionTaskLink_visionItemId_fkey'
  ) THEN
    ALTER TABLE "VisionTaskLink" ADD CONSTRAINT "VisionTaskLink_visionItemId_fkey"
      FOREIGN KEY ("visionItemId") REFERENCES "VisionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'VisionTaskLink_taskId_fkey'
  ) THEN
    ALTER TABLE "VisionTaskLink" ADD CONSTRAINT "VisionTaskLink_taskId_fkey"
      FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
