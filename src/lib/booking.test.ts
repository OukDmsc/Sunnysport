import { describe, expect, it } from "vitest";
import {
  BOOKING_DISCOUNT_CENTS,
  BOOKING_DURATION_HOURS,
  PLAYING_HOURS,
  calculateFinalBookingTotalCents,
  calculateTotalCents,
  getBookingTimes,
  overlaps,
} from "./booking";

describe("booking time and price rules", () => {
  it("creates exactly two hours of half-hour claims within 7 AM to 8 PM", () => {
    expect(PLAYING_HOURS).toBe("07:00-20:00");
    expect(BOOKING_DURATION_HOURS).toBe(2);
    expect(getBookingTimes("18:00", BOOKING_DURATION_HOURS)).toEqual({
      slots: ["18:00", "18:30", "19:00", "19:30"],
      endTime: "20:00",
    });
  });

  it("rejects times outside configured opening hours", () => {
    expect(() => getBookingTimes("06:30", 2)).toThrow(/opening hours/);
    expect(() => getBookingTimes("18:30", 2)).toThrow(/opening hours/);
  });

  it("rejects any session duration other than two hours", () => {
    expect(() => getBookingTimes("10:00", 1)).toThrow(/exactly 2 hours/);
    expect(() => getBookingTimes("10:00", 3)).toThrow(/exactly 2 hours/);
  });

  it("allows adjacent reservations but detects overlapping reservations", () => {
    expect(overlaps(18 * 60, 19 * 60, 19 * 60, 20 * 60)).toBe(false);
    expect(overlaps(18 * 60, 20 * 60, 19 * 60, 21 * 60)).toBe(true);
  });

  it("calculates the total in cents without floating point rounding", () => {
    const rentalTotal = calculateTotalCents(2500, BOOKING_DURATION_HOURS);
    expect(rentalTotal).toBe(5000);
    expect(calculateFinalBookingTotalCents(rentalTotal)).toBe(4750);
    expect(BOOKING_DISCOUNT_CENTS).toBe(250);
  });

  it("rejects rental prices that cannot cover the flat booking discount", () => {
    expect(() => calculateFinalBookingTotalCents(250)).toThrow(/more than the \$2.50/);
    expect(() => calculateFinalBookingTotalCents(249)).toThrow(/more than the \$2.50/);
  });
});
