-- CreateEnum
CREATE TYPE "FinancePlanType" AS ENUM ('CREDIT_SCORE', 'BUDGET', 'SAVINGS', 'DEBT_PAYOFF', 'INVESTMENT', 'EXPENSE_REDUCTION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FinancePlanStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "FinancePlan" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "FinancePlanType" NOT NULL DEFAULT 'CUSTOM',
    "status" "FinancePlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "goal" TEXT,
    "currentValue" DOUBLE PRECISION,
    "targetValue" DOUBLE PRECISION,
    "unit" TEXT,
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "managedByBot" TEXT NOT NULL DEFAULT 'adrian',
    "milestones" JSONB,
    "notes" TEXT,
    "sourceFile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancePlan_pkey" PRIMARY KEY ("id")
);
