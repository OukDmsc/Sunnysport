import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const booking = {
    id: "booking-1",
    reference: "FB-TEST",
    status: "PENDING",
    paymentStatus: "PENDING",
    paymentTransactionReference: "BANK-PRIVATE-REFERENCE",
    createdAt: new Date("2026-10-27T00:00:00.000Z"),
    field: { id: "field-1", name: "Main Field" },
  };
  return {
    booking,
    db: {
      customerBookingAccess: {
        findMany: vi.fn(async () => [{ booking }]),
        findUnique: vi.fn(async () => null),
      },
      booking: { findMany: vi.fn(async () => []) },
    },
    getCustomerAccountFromRequest: vi.fn(async () => null),
    isCustomerAuthRateLimited: vi.fn(() => false),
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/customer-auth", () => ({
  getCustomerAccountFromRequest: mocks.getCustomerAccountFromRequest,
  isCustomerAuthRateLimited: mocks.isCustomerAuthRateLimited,
}));

import { POST } from "./bookings/route";

function request() {
  return new Request("http://localhost:3000/api/customer/bookings", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.21",
    },
    body: JSON.stringify({ action: "list", tokens: ["a".repeat(64)] }),
  });
}

describe("customer booking status polling", () => {
  beforeEach(() => {
    mocks.isCustomerAuthRateLimited.mockReturnValue(false);
    mocks.db.customerBookingAccess.findMany.mockClear();
    mocks.db.customerBookingAccess.findMany.mockResolvedValue([{ booking: mocks.booking }]);
  });

  it("returns pending status to a valid booking token without exposing provider references", async () => {
    const response = await POST(request() as never);
    const result = await response.json() as { bookings: Array<Record<string, unknown>> };

    expect(response.status).toBe(200);
    expect(result.bookings[0]).toMatchObject({
      id: "booking-1",
      status: "PENDING",
      paymentStatus: "PENDING",
    });
    expect(result.bookings[0]).not.toHaveProperty("paymentTransactionReference");
    expect(mocks.isCustomerAuthRateLimited).toHaveBeenCalledWith(
      "customer-booking-status",
      "203.0.113.21",
      20,
      60_000,
    );
  });

  it("rate-limits repeated customer status checks", async () => {
    mocks.isCustomerAuthRateLimited.mockReturnValue(true);

    const response = await POST(request() as never);

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(mocks.db.customerBookingAccess.findMany).not.toHaveBeenCalled();
  });
});
