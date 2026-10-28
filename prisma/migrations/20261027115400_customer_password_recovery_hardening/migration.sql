ALTER TABLE "CustomerAuthChallenge" ADD COLUMN "recoveryMethod" TEXT NOT NULL DEFAULT 'email';
ALTER TABLE "CustomerAuthChallenge" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CustomerAuthChallenge" ADD COLUMN "verifiedAt" DATETIME;
ALTER TABLE "CustomerAuthChallenge" ADD COLUMN "resetTokenHash" TEXT;
ALTER TABLE "CustomerAuthChallenge" ADD COLUMN "resetTokenExpiresAt" DATETIME;

CREATE UNIQUE INDEX "CustomerAuthChallenge_resetTokenHash_key" ON "CustomerAuthChallenge"("resetTokenHash");
CREATE INDEX "CustomerAuthChallenge_purpose_usedAt_expiresAt_idx" ON "CustomerAuthChallenge"("purpose", "usedAt", "expiresAt");

CREATE TABLE "CustomerAuthRateLimit" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL,
    "resetAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX "CustomerAuthRateLimit_resetAt_idx" ON "CustomerAuthRateLimit"("resetAt");
