CREATE TABLE "PendingFileDeletion" (
    "id" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingFileDeletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingFileDeletion_storageKey_key" ON "PendingFileDeletion"("storageKey");
CREATE INDEX "PendingFileDeletion_nextAttemptAt_idx" ON "PendingFileDeletion"("nextAttemptAt");
