import { BOOKING_PRICE_CENTS } from "./booking";

export const DEPOSIT_PERCENT = 10;

export function calculateDepositCents(totalCents: number) {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error("Invalid booking total.");
  }
  return Math.ceil(totalCents * DEPOSIT_PERCENT / 100);
}

export function calculateBookingAmountDueCents(totalCents: number, bookingAdjustmentCents: number) {
  return bookingAdjustmentCents === -BOOKING_PRICE_CENTS
    ? totalCents
    : calculateDepositCents(totalCents);
}
