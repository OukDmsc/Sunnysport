export type PaymentAction = "verify" | "fail" | "refund";

export function canCustomerCancelBooking(paymentStatus: string, bookingStatus: string) {
  return paymentStatus === "PENDING" && bookingStatus === "PENDING";
}

export function getPaymentTransition(
  paymentStatus: string,
  bookingStatus: string,
  action: PaymentAction,
) {
  if (action === "refund") {
    if (paymentStatus !== "PAID") throw new Error("Only verified payments can be refunded.");
    return { paymentStatus: "REFUNDED", bookingStatus: "CANCELLED", releaseSlots: true };
  }
  if (paymentStatus !== "PENDING" || bookingStatus === "CANCELLED") {
    throw new Error("Only pending payments for active bookings can be reviewed.");
  }
  return action === "verify"
    ? { paymentStatus: "PAID", bookingStatus: "CONFIRMED", releaseSlots: false }
    : { paymentStatus: "FAILED", bookingStatus: "CANCELLED", releaseSlots: true };
}
