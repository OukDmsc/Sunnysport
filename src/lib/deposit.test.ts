import { describe, expect, it } from "vitest";
import { calculateBookingAmountDueCents, calculateDepositCents, DEPOSIT_PERCENT } from "./deposit";

describe("booking deposit", () => {
  it("calculates ten percent rounded up to a whole cent", () => {
    expect(DEPOSIT_PERCENT).toBe(10);
    expect(calculateDepositCents(2500)).toBe(250);
    expect(calculateDepositCents(2501)).toBe(251);
    expect(calculateDepositCents(1)).toBe(1);
  });

  it("rejects invalid totals", () => {
    expect(() => calculateDepositCents(-1)).toThrow("Invalid booking total.");
    expect(() => calculateDepositCents(1.5)).toThrow("Invalid booking total.");
  });

  it("uses full payment for new discounted bookings and preserves legacy deposit amounts", () => {
    expect(calculateBookingAmountDueCents(4750, -250)).toBe(4750);
    expect(calculateBookingAmountDueCents(25000, 0)).toBe(2500);
    expect(calculateBookingAmountDueCents(2622, 122)).toBe(263);
  });
});
