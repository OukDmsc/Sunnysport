-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CustomerAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CustomerAccount" ("createdAt", "email", "id", "name", "passwordHash", "phone", "sessionVersion", "updatedAt") SELECT "createdAt", "email", "id", "name", "passwordHash", "phone", "sessionVersion", "updatedAt" FROM "CustomerAccount";
DROP TABLE "CustomerAccount";
ALTER TABLE "new_CustomerAccount" RENAME TO "CustomerAccount";
CREATE UNIQUE INDEX "CustomerAccount_email_key" ON "CustomerAccount"("email");
CREATE UNIQUE INDEX "CustomerAccount_phone_key" ON "CustomerAccount"("phone");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
