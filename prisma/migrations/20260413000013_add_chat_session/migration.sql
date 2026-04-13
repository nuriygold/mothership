-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BackfillSessions: ensure every orphaned ChatMessage gets a ChatSession row
INSERT INTO "ChatSession" ("id", "updatedAt")
SELECT DISTINCT m."sessionId", NOW()
FROM "ChatMessage" m
WHERE NOT EXISTS (
    SELECT 1 FROM "ChatSession" s WHERE s."id" = m."sessionId"
);
