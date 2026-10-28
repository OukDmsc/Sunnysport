import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const booking = {
    id: "booking-1",
    status: "PENDING",
    paymentStatus: "PENDING",
    totalCents: 25_000,
    bookingFeeCents: -250,
    amountPaidCents: 0,
    paymentTransactionReference: null as string | null,
    verifiedAt: null as Date | null,
    verifiedBy: null as string | null,
  };
  const usedReferences = new Set<string>();
  const db = {
    booking: {
      findUnique: vi.fn(async () => ({ ...booking })),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (
          where.id !== booking.id ||
          where.status !== booking.status ||
          where.paymentStatus !== booking.paymentStatus
        ) return { count: 0 };
        const transactionReference = data.paymentTransactionReference;
        if (typeof transactionReference === "string" && usedReferences.has(transactionReference)) {
          return { count: 0 };
        }
        Object.assign(booking, data);
        if (typeof transactionReference === "string") usedReferences.add(transactionReference);
        return { count: 1 };
      }),
    },
    bookingSlot: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    $transaction: vi.fn(async (callback: (tx: typeof db) => unknown) => callback(db)),
  };
  return { booking, db, usedReferences, hasTrustedOrigin: vi.fn(() => true), isAdminRequest: vi.fn(async () => true) };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth", () => ({
  hasTrustedOrigin: mocks.hasTrustedOrigin,
  isAdminRequest: mocks.isAdminRequest,
  unauthorized: () => Response.json({ error: "Unauthorized." }, { status: 401 }),
}));
vi.mock("@/lib/notifications", () => ({
  notifyAdmin: vi.fn(async () => ({ delivered: true })),
}));

import { POST } from "./[id]/route";

function request(body: unknown) {
  return new Request("http://localhost:3000/api/payments/booking-1", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function review(body: unknown) {
  return POST(request(body) as never, { params: Promise.resolve({ id: "booking-1" }) });
}

describe("manual payment verification route", () => {
  beforeEach(() => {
    Object.assign(mocks.booking, {
      status: "PENDING",
      paymentStatus: "PENDING",
      amountPaidCents: 0,
      paymentTransactionReference: null,
      verifiedAt: null,
      verifiedBy: null,
    });
    mocks.usedReferences.clear();
    mocks.db.booking.updateMany.mockClear();
    mocks.db.bookingSlot.deleteMany.mockClear();
    mocks.isAdminRequest.mockResolvedValue(true);
  });

  it("does not allow a payment to be marked paid without a bank transaction reference", async () => {
    const response = await review({ action: "verify", paymentStatus: "PAID" });

    expect(response.status).toBe(400);
    expect(mocks.booking.paymentStatus).toBe("PENDING");
    expect(mocks.db.booking.updateMany).not.toHaveBeenCalled();
  });

  it("records the checked transaction and confirms the booking atomically", async () => {
    const response = await review({ action: "verify", transactionReference: "BANK-TXN-0001" });

    expect(response.status).toBe(200);
    expect(mocks.booking).toMatchObject({
      status: "CONFIRMED",
      paymentStatus: "PAID",
      amountPaidCents: 25_000,
      paymentTransactionReference: "BANK-TXN-0001",
    });
    expect(mocks.booking.verifiedAt).toBeInstanceOf(Date);
    expect(mocks.db.booking.updateMany).toHaveBeenCalledTimes(1);
  });

  it("rejects reuse of a transaction reference", async () => {
    mocks.usedReferences.add("BANK-TXN-REUSED");

    const response = await review({ action: "verify", transactionReference: "BANK-TXN-REUSED" });

    expect(response.status).toBe(409);
    expect(mocks.booking.paymentStatus).toBe("PENDING");
    expect(mocks.booking.paymentTransactionReference).toBeNull();
  });

  it("does not permit a customer request to confirm a payment", async () => {
    mocks.isAdminRequest.mockResolvedValue(false);

    const response = await review({ action: "verify", transactionReference: "BANK-TXN-0002" });

    expect(response.status).toBe(401);
    expect(mocks.db.booking.updateMany).not.toHaveBeenCalled();
  });
});
