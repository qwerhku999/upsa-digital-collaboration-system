CREATE TABLE "RegistrationInviteCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistrationInviteCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RegistrationInviteCode_codeHash_key" ON "RegistrationInviteCode"("codeHash");
CREATE INDEX "RegistrationInviteCode_expiresAt_revokedAt_idx" ON "RegistrationInviteCode"("expiresAt", "revokedAt");

ALTER TABLE "RegistrationInviteCode"
ADD CONSTRAINT "RegistrationInviteCode_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
