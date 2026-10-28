import { describe, expect, it } from "vitest";
import { canCustomerCancelBooking, getPaymentTransition } from "./payment";

describe("customer booking cancellation", () => {
  it("allows customer cancellation only for unpaid pending bookings", () => {
    expect(canCustomerCancelBooking("PENDING", "PENDING")).toBe(true);
    expect(canCustomerCancelBooking("PAID", "CONFIRMED")).toBe(false);
    expect(canCustomerCancelBooking("CANCELLED", "CANCELLED")).toBe(false);
    expect(canCustomerCancelBooking("PENDING", "CANCELLED")).toBe(false);
  });
});

describe("manual payment verification", () => {
  it("only confirms an active booking after admin verification", () => {
    expect(getPaymentTransition("PENDING", "PENDING", "verify")).toEqual({
      paymentStatus: "PAID",
      bookingStatus: "CONFIRMED",
      releaseSlots: false,
    });
  });

  it("releases a slot when an administrator records a failed payment", () => {
    expect(getPaymentTransition("PENDING", "PENDING", "fail")).toEqual({
      paymentStatus: "FAILED",
      bookingStatus: "CANCELLED",
      releaseSlots: true,
    });
  });

  it("does not allow cancelled or already reviewed bookings to be verified", () => {
    expect(() => getPaymentTransition("PENDING", "CANCELLED", "verify")).toThrow(/Only pending payments/);
    expect(() => getPaymentTransition("PAID", "CONFIRMED", "verify")).toThrow(/Only pending payments/);
  });

  it("records a refund only after payment was verified", () => {
    expect(getPaymentTransition("PAID", "CONFIRMED", "refund")).toEqual({
      paymentStatus: "REFUNDED",
      bookingStatus: "CANCELLED",
      releaseSlots: true,
    });
    expect(() => getPaymentTransition("PENDING", "PENDING", "refund")).toThrow(/Only verified payments/);
  });
});
