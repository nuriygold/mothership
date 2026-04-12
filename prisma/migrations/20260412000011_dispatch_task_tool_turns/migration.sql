-- AlterTable: add toolTurns to DispatchTask for agentic multi-step loop observability
ALTER TABLE "DispatchTask" ADD COLUMN "toolTurns" INTEGER;
