CREATE TABLE "CustomerAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "verifiedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "CustomerAuthChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerAccountId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "emailCodeHash" TEXT NOT NULL,
    "phoneCodeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerAuthChallenge_customerAccountId_fkey" FOREIGN KEY ("customerAccountId") REFERENCES "CustomerAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CustomerAccount_email_key" ON "CustomerAccount"("email");
CREATE UNIQUE INDEX "CustomerAccount_phone_key" ON "CustomerAccount"("phone");
CREATE INDEX "CustomerAuthChallenge_customerAccountId_purpose_createdAt_idx" ON "CustomerAuthChallenge"("customerAccountId", "purpose", "createdAt");

ALTER TABLE "Booking" ADD COLUMN "customerAccountId" TEXT REFERENCES "CustomerAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Booking_customerAccountId_idx" ON "Booking"("customerAccountId");
