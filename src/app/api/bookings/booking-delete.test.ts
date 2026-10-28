import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const booking = {
    id: "booking-1",
    status: "CONFIRMED",
    paymentStatus: "PAID",
    updatedAt: new Date("2026-10-27T08:00:00.000Z"),
  };
  const db = {
    booking: {
      findUnique: vi.fn(async (): Promise<typeof booking | null> => ({ ...booking })),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const matches = where.id === booking.id
          && where.status === booking.status
          && where.paymentStatus === booking.paymentStatus
          && where.updatedAt === booking.updatedAt;
        if (matches) booking.id = "";
        return { count: matches ? 1 : 0 };
      }),
    },
    $transaction: vi.fn(async (callback: (tx: typeof db) => unknown) => callback(db)),
  };
  return {
    booking,
    db,
    hasTrustedOrigin: vi.fn(() => true),
    isAdminRequest: vi.fn(async () => true),
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth", () => ({
  hasTrustedOrigin: mocks.hasTrustedOrigin,
  isAdminRequest: mocks.isAdminRequest,
  unauthorized: () => Response.json({ error: "Administrator sign-in required." }, { status: 401 }),
}));

import { DELETE } from "./[id]/route";

function request() {
  return new Request("http://localhost:3000/api/bookings/booking-1", {
    method: "DELETE",
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
    },
  });
}

async function removeBooking() {
  return DELETE(request() as never, { params: Promise.resolve({ id: "booking-1" }) });
}

describe("admin booking history deletion", () => {
  beforeEach(() => {
    Object.assign(mocks.booking, {
      id: "booking-1",
      status: "CONFIRMED",
      paymentStatus: "PAID",
      updatedAt: new Date("2026-10-27T08:00:00.000Z"),
    });
    mocks.db.booking.findUnique.mockReset();
    mocks.db.booking.findUnique.mockImplementation(async () => ({ ...mocks.booking }));
    mocks.db.booking.deleteMany.mockReset();
    mocks.db.booking.deleteMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      const matches = where.id === mocks.booking.id
        && where.status === mocks.booking.status
        && where.paymentStatus === mocks.booking.paymentStatus
        && where.updatedAt === mocks.booking.updatedAt;
      if (matches) mocks.booking.id = "";
      return { count: matches ? 1 : 0 };
    });
    mocks.db.$transaction.mockClear();
    mocks.hasTrustedOrigin.mockReturnValue(true);
    mocks.isAdminRequest.mockResolvedValue(true);
  });

  it("deletes only the selected booking through an optimistic transactional delete", async () => {
    const response = await removeBooking();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.db.booking.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "booking-1",
        status: "CONFIRMED",
        paymentStatus: "PAID",
        updatedAt: mocks.booking.updatedAt,
      },
    });
  });

  it("requires an authenticated administrator", async () => {
    mocks.isAdminRequest.mockResolvedValue(false);

    const response = await removeBooking();

    expect(response.status).toBe(401);
    expect(mocks.db.booking.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects untrusted request origins", async () => {
    mocks.hasTrustedOrigin.mockReturnValue(false);

    const response = await removeBooking();

    expect(response.status).toBe(403);
    expect(mocks.db.booking.deleteMany).not.toHaveBeenCalled();
  });

  it("returns not found without deleting when the booking does not exist", async () => {
    mocks.db.booking.findUnique.mockResolvedValue(null);

    const response = await removeBooking();

    expect(response.status).toBe(404);
    expect(mocks.db.booking.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects a booking changed concurrently", async () => {
    mocks.db.booking.deleteMany.mockResolvedValue({ count: 0 });

    const response = await removeBooking();

    expect(response.status).toBe(409);
  });
});
