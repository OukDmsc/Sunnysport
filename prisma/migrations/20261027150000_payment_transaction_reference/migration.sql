ALTER TABLE "Booking" ADD COLUMN "paymentTransactionReference" TEXT;

CREATE UNIQUE INDEX "Booking_paymentTransactionReference_key"
ON "Booking"("paymentTransactionReference");
