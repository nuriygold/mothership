-- AlterTable: store peer-review output from Emerald on each dispatch task
ALTER TABLE "DispatchTask" ADD COLUMN "reviewOutput" TEXT;
