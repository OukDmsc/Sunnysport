import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const limits = new Map<string, { key: string; count: number; resetAt: Date; updatedAt: Date }>();
  return {
    limits,
    createCustomer: vi.fn(),
    findLimit: vi.fn(async ({ where }: { where: { key: string } }) => limits.get(where.key) ?? null),
    createLimit: vi.fn(async ({ data }: { data: { key: string; count: number; resetAt: Date; updatedAt?: Date } }) => {
      const row = { ...data, updatedAt: data.updatedAt ?? new Date() };
      limits.set(data.key, row);
      return row;
    }),
    updateLimit: vi.fn(async ({ where, data }: {
      where: { key: string; count: number; resetAt: Date };
      data: { count: number | { increment: number }; resetAt?: Date; updatedAt?: Date };
    }) => {
      const row = limits.get(where.key);
      if (!row || row.count !== where.count || row.resetAt.getTime() !== where.resetAt.getTime()) return { count: 0 };
      row.count = typeof data.count === "number" ? data.count : row.count + data.count.increment;
      if (data.resetAt) row.resetAt = data.resetAt;
      if (data.updatedAt) row.updatedAt = data.updatedAt;
      return { count: 1 };
    }),
    deleteLimits: vi.fn(async () => ({ count: 0 })),
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    customerAccount: { create: mocks.createCustomer },
    customerAuthRateLimit: {
      findUnique: mocks.findLimit,
      create: mocks.createLimit,
      updateMany: mocks.updateLimit,
      deleteMany: mocks.deleteLimits,
    },
  },
}));

import { POST as registerCustomer } from "./register/route";

function request(body: unknown, ip: string) {
  return new Request("https://sunny.test/api/customer/register", {
    method: "POST",
    headers: {
      origin: "https://sunny.test",
      host: "sunny.test",
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.limits.clear();
  mocks.createCustomer.mockReset();
  vi.stubEnv("SESSION_SECRET", "test-session-secret-with-more-than-32-characters");
  mocks.createCustomer.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "created-customer",
    sessionVersion: 0,
    ...data,
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("customer registration", () => {
  it("creates an account with a password hash and starts a customer session", async () => {
    const password = "StrongPass123";
    const response = await registerCustomer(request({
      name: "Test Customer",
      email: "Customer@sunny.test",
      password,
    }, "203.0.113.1") as never);

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      customer: { id: "created-customer", email: "customer@sunny.test" },
    });
    const stored = mocks.createCustomer.mock.calls[0][0].data;
    expect(stored.passwordHash).not.toBe(password);
    expect(String(stored.passwordHash)).toMatch(/^scrypt\$/);
    expect(response.headers.get("set-cookie")).toContain("football_customer=");
  });

  it("returns field-specific errors for duplicate email and phone constraints", async () => {
    mocks.createCustomer.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["email"] },
    }));
    const duplicateEmail = await registerCustomer(request({
      name: "Duplicate Email",
      email: "taken@sunny.test",
      password: "StrongPass123",
    }, "203.0.113.2") as never);
    expect(duplicateEmail.status).toBe(409);
    expect(await duplicateEmail.json()).toEqual({ error: "An account with this email already exists." });

    mocks.createCustomer.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["phone"] },
    }));
    const duplicatePhone = await registerCustomer(request({
      name: "Duplicate Phone",
      identifier: "012 345 678",
      password: "StrongPass123",
    }, "203.0.113.3") as never);
    expect(duplicatePhone.status).toBe(409);
    expect(await duplicatePhone.json()).toEqual({ error: "An account with this phone number already exists." });
  });

  it("rejects invalid input without attempting a database write", async () => {
    const response = await registerCustomer(request({
      name: "Invalid",
      email: "not-an-email",
      password: "short",
    }, "203.0.113.4") as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
    expect(mocks.createCustomer).not.toHaveBeenCalled();
  });

  it("returns a safe JSON error and does not log database details on write failure", async () => {
    const privateDetail = "postgresql://private-user:private-password@db.example.test/private";
    mocks.createCustomer.mockRejectedValueOnce(new Error(privateDetail));
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await registerCustomer(request({
      name: "Database Failure",
      email: "customer@sunny.test",
      password: "StrongPass123",
    }, "203.0.113.5") as never);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Unable to create the customer account." });
    expect(JSON.stringify(logError.mock.calls)).not.toContain(privateDetail);
    expect(logError).toHaveBeenCalledWith("Customer registration failed.", { name: "Error" });
  });
});
