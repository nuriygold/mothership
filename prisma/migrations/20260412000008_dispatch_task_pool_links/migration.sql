-- AlterTable: link DispatchTask rows back to their task-pool GitHub issues
ALTER TABLE "DispatchTask" ADD COLUMN "taskPoolIssueNumber" INTEGER;
ALTER TABLE "DispatchTask" ADD COLUMN "taskPoolIssueUrl"    TEXT;
