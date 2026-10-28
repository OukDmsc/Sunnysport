CREATE TABLE "CustomerBookingAccess" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bookingId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerBookingAccess_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CustomerBookingAccess_bookingId_key" ON "CustomerBookingAccess"("bookingId");
CREATE UNIQUE INDEX "CustomerBookingAccess_tokenHash_key" ON "CustomerBookingAccess"("tokenHash");
