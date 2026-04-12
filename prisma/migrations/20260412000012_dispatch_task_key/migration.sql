-- Add plan key column to DispatchTask for dependency graph resolution
ALTER TABLE "DispatchTask" ADD COLUMN "key" TEXT;
