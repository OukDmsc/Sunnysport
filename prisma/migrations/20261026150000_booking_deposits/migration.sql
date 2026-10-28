ALTER TABLE "Booking" ADD COLUMN "amountPaidCents" INTEGER NOT NULL DEFAULT 0;

UPDATE "Booking"
SET "amountPaidCents" = "totalCents"
WHERE "paymentStatus" = 'PAID';
