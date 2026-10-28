import { describe, expect, it } from "vitest";
import { createCustomerBookingAccessToken, hashCustomerBookingAccessToken } from "./customer-booking-access";

describe("customer booking access", () => {
  it("creates unique high-entropy tokens and stores only a one-way hash", () => {
    const first = createCustomerBookingAccessToken();
    const second = createCustomerBookingAccessToken();

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
    expect(hashCustomerBookingAccessToken(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCustomerBookingAccessToken(first)).not.toBe(first);
    expect(hashCustomerBookingAccessToken(first)).toBe(hashCustomerBookingAccessToken(first));
  });
});
