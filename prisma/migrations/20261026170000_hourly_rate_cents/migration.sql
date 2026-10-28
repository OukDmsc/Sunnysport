ALTER TABLE "Field" RENAME COLUMN "hourlyRate" TO "hourlyRateCents";
UPDATE "Field" SET "hourlyRateCents" = "hourlyRateCents" * 100;
