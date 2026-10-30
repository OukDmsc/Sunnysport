import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state: { accounts: Row[]; challenges: Row[]; limits: Row[]; nextId: number } = {
    accounts: [],
    challenges: [],
    limits: [],
    nextId: 1,
  };
  const matches = (row: Row, where: Row): boolean => Object.entries(where).every(([key, expected]) => {
    if (key === "OR") return (expected as Row[]).some((condition) => matches(row, condition));
    const actual = row[key];
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    if (expected && typeof expected === "object") {
      const filters = expected as Row;
      if (filters.gt instanceof Date && (!(actual instanceof Date) || actual <= filters.gt)) return false;
      if (filters.lt instanceof Date && (!(actual instanceof Date) || actual >= filters.lt)) return false;
      if ("not" in filters && actual === filters.not) return false;
      if (typeof filters.lt === "number" && (typeof actual !== "number" || actual >= filters.lt)) return false;
      return true;
    }
    return actual === expected;
  });
  const updateRows = (rows: Row[], where: Row, data: Row) => {
    const found = rows.filter((row) => matches(row, where));
    for (const row of found) {
      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === "object" && "increment" in value) {
          row[key] = Number(row[key]) + Number((value as Row).increment);
        } else {
          row[key] = value;
        }
      }
    }
    return { count: found.length };
  };
  const db = {
    customerAccount: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => state.accounts.find((row) => matches(row, where)) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: `created-customer-${state.nextId++}`,
          sessionVersion: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.accounts.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = state.accounts.find((item) => matches(item, where));
        if (!row) throw new Error("Missing test customer.");
        updateRows([row], where, data);
        return row;
      }),
    },
    customerAuthChallenge: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: `challenge-${state.nextId++}`,
          attemptCount: 0,
          usedAt: null,
          verifiedAt: null,
          resetTokenHash: null,
          resetTokenExpiresAt: null,
          createdAt: new Date(),
          ...data,
        };
        state.challenges.push(row);
        return row;
      }),
      findFirst: vi.fn(async ({ where, orderBy }: { where: Row; orderBy?: Row }) => {
        const rows = state.challenges.filter((row) => matches(row, where));
        if (orderBy?.createdAt === "desc") rows.sort((a, b) => Number((b.createdAt as Date).getTime() - (a.createdAt as Date).getTime()));
        return rows[0] ?? null;
      }),
      findUnique: vi.fn(async ({ where }: { where: Row }) => state.challenges.find((row) => matches(row, where)) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => updateRows(state.challenges, where, data)),
      deleteMany: vi.fn(async ({ where }: { where: Row }) => {
        const before = state.challenges.length;
        state.challenges = state.challenges.filter((row) => !matches(row, where));
        return { count: before - state.challenges.length };
      }),
    },
    customerAuthRateLimit: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => state.limits.find((row) => matches(row, where)) ?? null),
      create: vi.fn(async ({ data }: { data: Row }) => {
        if (state.limits.some((row) => row.key === data.key)) {
          throw Object.assign(new Error("Unique constraint"), { code: "P2002" });
        }
        state.limits.push(data);
        return data;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => updateRows(state.limits, where, data)),
      deleteMany: vi.fn(async ({ where }: { where: Row }) => {
        const before = state.limits.length;
        state.limits = state.limits.filter((row) => !matches(row, where));
        return { count: before - state.limits.length };
      }),
    },
    $transaction: vi.fn(async (callback: (tx: Record<string, unknown>) => unknown) => callback(db)),
  };
  return { db, state };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

import { POST as requestRecovery } from "./forgot-password/route";
import { POST as customerLogin } from "./login/route";
import { POST as registerCustomer } from "./register/route";
import { POST as verifyRecoveryCode } from "./verify-reset-code/route";
import { POST as resetPassword } from "./reset-password/route";
import {
  generateCustomerRecoveryCode,
  hashCustomerPassword,
  hashCustomerRecoveryCode,
  isCustomerAuthChallengeValid,
  verifyCustomerPassword,
} from "@/lib/customer-auth";

function postRequest(path: string, body: unknown, ip = "203.0.113.21") {
  return new Request(`http://localhost:3000/api/customer/${path}`, {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
      "content-type": "application/json",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify(body),
  });
}

async function requestEmailCode(identifier = "customer@example.test") {
  const response = await requestRecovery(postRequest("forgot-password", {
    identifier,
    channel: "email",
  }) as never);
  const providerRequest = vi.mocked(fetch).mock.calls.at(-1)?.[1];
  const email = JSON.parse(String(providerRequest?.body)) as { text: string };
  const code = email.text.match(/\b\d{6}\b/)?.[0];
  if (!code) throw new Error("The test email did not contain a recovery code.");
  return { response, code };
}

beforeEach(() => {
  mocks.state.accounts = [{
    id: "customer-1",
    name: "Test Customer",
    email: "customer@example.test",
    phone: "+85512345678",
    passwordHash: "old-hash",
    sessionVersion: 0,
  }];
  mocks.state.challenges = [];
  mocks.state.limits = [];
  mocks.state.nextId = 1;
  vi.stubEnv("SESSION_SECRET", "test-session-secret-with-more-than-32-characters");
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("EMAIL_FROM", "SUNNY SPORT CLUB <password-reset@sunny.test>");
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("SMS_PROVIDER", "infobip");
  vi.stubEnv("INFOBIP_API_KEY", "");
  vi.stubEnv("INFOBIP_BASE_URL", "");
  vi.stubEnv("INFOBIP_FROM_EMAIL", "");
  vi.stubEnv("INFOBIP_SENDER", "");
  vi.stubEnv("SMTP_HOST", "");
  vi.stubEnv("TWILIO_SMS_ENABLED", "false");
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/sms/3/messages")) {
      return Response.json({ messages: [{ status: { name: "PENDING_ACCEPTED" } }] }, { status: 200 });
    }
    if (String(input).includes("/email/4/messages")) {
      return Response.json({ messages: [{ status: { name: "PENDING_ACCEPTED" } }] }, { status: 200 });
    }
    if (String(input).includes("/Messages.json")) {
      return Response.json({ sid: "SMtest" }, { status: 200 });
    }
    return new Response("{}", { status: 200 });
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("customer password recovery", () => {
  it("asks customers without an account to create one and keeps incorrect-password errors generic", async () => {
    const missingAccountLogin = await customerLogin(postRequest("customer/login", {
      identifier: "new-customer@example.test",
      password: "A-strong-password-123",
    }) as never);

    expect(missingAccountLogin.status).toBe(401);
    expect(await missingAccountLogin.json()).toMatchObject({
      error: "You have not created an account, Please create your account now.",
      errorCode: "CUSTOMER_ACCOUNT_NOT_FOUND",
    });

    const incorrectPasswordLogin = await customerLogin(postRequest("customer/login", {
      identifier: "customer@example.test",
      password: "Incorrect-customer-pass-4",
    }) as never);

    expect(incorrectPasswordLogin.status).toBe(401);
    expect(await incorrectPasswordLogin.json()).toEqual({ error: "Email/phone or password is incorrect." });
  });

  it("generates six-digit cryptographic codes and stores a keyed hash", () => {
    const code = generateCustomerRecoveryCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(hashCustomerRecoveryCode(code)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashCustomerRecoveryCode(code)).not.toBe(code);
  });

  it("registers an account with email only and normalizes it for login", async () => {
    const response = await registerCustomer(postRequest("customer/register", {
      name: "Email Only",
      identifier: " Email.Only@example.test ",
      password: "StrongPass123",
    }) as never);

    expect(response.status).toBe(201);
    expect(mocks.state.accounts[1]).toMatchObject({
      name: "Email Only",
      email: "email.only@example.test",
      phone: null,
    });
    const login = await customerLogin(postRequest("customer/login", {
      identifier: "EMAIL.ONLY@example.test",
      password: "StrongPass123",
    }) as never);
    expect(login.status).toBe(200);
  });

  it("registers an account with phone only and normalizes it for login", async () => {
    const response = await registerCustomer(postRequest("customer/register", {
      name: "Phone Only",
      identifier: "012 345 679",
      password: "StrongPass123",
    }) as never);

    expect(response.status).toBe(201);
    expect(mocks.state.accounts[1]).toMatchObject({
      name: "Phone Only",
      email: null,
      phone: "+85512345679",
    });
    const login = await customerLogin(postRequest("customer/login", {
      identifier: "+855 12 345 679",
      password: "StrongPass123",
    }) as never);
    expect(login.status).toBe(200);
  });

  it("accepts any password from 8 through 16 characters during registration", async () => {
    const minimumLength = await registerCustomer(postRequest("customer/register", {
      name: "Minimum Password",
      email: "minimum-password@example.test",
      password: "12345678",
    }, "203.0.113.30") as never);
    const maximumLength = await registerCustomer(postRequest("customer/register", {
      name: "Maximum Password",
      email: "maximum-password@example.test",
      password: "@@@@@@@@@@@@@@@@",
    }, "203.0.113.31") as never);
    const tooShort = await registerCustomer(postRequest("customer/register", {
      name: "Short Password",
      email: "short-password@example.test",
      password: "1234567",
    }, "203.0.113.32") as never);
    const tooLong = await registerCustomer(postRequest("customer/register", {
      name: "Long Password",
      email: "long-password@example.test",
      password: "@@@@@@@@@@@@@@@@@",
    }, "203.0.113.33") as never);

    expect(minimumLength.status).toBe(201);
    expect(maximumLength.status).toBe(201);
    expect(tooShort.status).toBe(400);
    expect(tooLong.status).toBe(400);
  });

  it("rejects account creation with both or neither contact method", async () => {
    const both = await registerCustomer(postRequest("customer/register", {
      name: "Both Contacts",
      email: "both@example.test",
      phone: "+85512345679",
      password: "StrongPass123",
    }) as never);
    expect(both.status).toBe(400);

    const neither = await registerCustomer(postRequest("customer/register", {
      name: "No Contact",
      password: "StrongPass123",
    }) as never);
    expect(neither.status).toBe(400);
    expect(mocks.state.accounts).toHaveLength(1);
  });

  it("rejects incorrect, expired, reused, and exhausted OTP challenges", () => {
    const challenge = {
      recoveryMethod: "email",
      emailCodeHash: hashCustomerRecoveryCode("123456"),
      phoneCodeHash: "",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      verifiedAt: null,
      attemptCount: 0,
    };
    expect(isCustomerAuthChallengeValid(challenge, "123456")).toBe(true);
    expect(isCustomerAuthChallengeValid(challenge, "000000")).toBe(false);
    expect(isCustomerAuthChallengeValid({ ...challenge, expiresAt: new Date(0) }, "123456")).toBe(false);
    expect(isCustomerAuthChallengeValid({ ...challenge, usedAt: new Date() }, "123456")).toBe(false);
    expect(isCustomerAuthChallengeValid({ ...challenge, verifiedAt: new Date() }, "123456")).toBe(false);
    expect(isCustomerAuthChallengeValid({ ...challenge, attemptCount: 5 }, "123456")).toBe(false);
  });

  it("returns a generic response for unknown accounts without sending an OTP", async () => {
    const response = await requestRecovery(postRequest("forgot-password", {
      identifier: "missing@example.test",
      channel: "email",
    }) as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "If an account matches the information provided, recovery instructions will be sent.",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.state.challenges).toHaveLength(0);

    vi.stubEnv("SMS_PROVIDER", "twilio");
    vi.stubEnv("TWILIO_SMS_ENABLED", "true");
    vi.stubEnv("TWILIO_ACCOUNT_SID", `AC${"a".repeat(32)}`);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "b".repeat(32));
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+855123456789");
    const unknownPhone = await requestRecovery(postRequest("forgot-password", {
      identifier: "+85598765432",
      channel: "phone",
    }) as never);
    expect(unknownPhone.status).toBe(200);
    expect(await unknownPhone.json()).toEqual({
      message: "If an account matches the information provided, recovery instructions will be sent.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires a configured SMS provider and Cambodian phone format", async () => {
    const unavailable = await requestRecovery(postRequest("forgot-password", {
      identifier: "+85512345678",
      channel: "phone",
    }) as never);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ error: expect.stringContaining("SMS provider is not configured") });

    vi.stubEnv("SMS_PROVIDER", "twilio");
    vi.stubEnv("TWILIO_SMS_ENABLED", "true");
    vi.stubEnv("TWILIO_ACCOUNT_SID", `AC${"a".repeat(32)}`);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "b".repeat(32));
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+855123456789");
    const invalidPhone = await requestRecovery(postRequest("forgot-password", {
      identifier: "+12025550123",
      channel: "phone",
    }) as never);
    expect(invalidPhone.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports missing email provider environment variable names without exposing secret values", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "infobip");
    vi.stubEnv("INFOBIP_BASE_URL", "eewd32.api.infobip.com");
    vi.stubEnv("INFOBIP_FROM_EMAIL", "password-reset@sunny.test");
    vi.stubEnv("INFOBIP_API_KEY", "");

    const response = await requestRecovery(postRequest("forgot-password", {
      identifier: "customer@example.test",
      channel: "email",
    }) as never);

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toContain("INFOBIP_API_KEY");
    expect(JSON.stringify(body)).not.toContain("a-private-api-key");
  });

  it("sends a Cambodian SMS OTP through the server-side Twilio API", async () => {
    vi.stubEnv("SMS_PROVIDER", "twilio");
    vi.stubEnv("TWILIO_SMS_ENABLED", "true");
    vi.stubEnv("TWILIO_ACCOUNT_SID", `AC${"a".repeat(32)}`);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "b".repeat(32));
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+855123456789");
    const response = await requestRecovery(postRequest("forgot-password", {
      identifier: "012 345 678",
      channel: "phone",
    }) as never);
    expect(response.status).toBe(200);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toContain("/Messages.json");
    expect(init?.headers).toMatchObject({ authorization: expect.stringMatching(/^Basic /) });
    const sms = new URLSearchParams(String(init?.body));
    expect(sms.get("To")).toBe("+85512345678");
    expect(sms.get("Body")).toMatch(/\d{6}/);
    expect(await response.json()).not.toHaveProperty("code");
    expect(mocks.state.challenges[0].recoveryMethod).toBe("phone");
  });

  it("sends a Cambodian SMS OTP through the server-side Infobip SMS API", async () => {
    vi.stubEnv("INFOBIP_API_KEY", "a-private-api-key-with-at-least-32-characters");
    vi.stubEnv("INFOBIP_BASE_URL", "eewd32.api.infobip.com");
    vi.stubEnv("INFOBIP_SENDER", "SUNNYSPORT");
    const response = await requestRecovery(postRequest("forgot-password", {
      identifier: "012 345 678",
      channel: "phone",
    }) as never);
    expect(response.status).toBe(200);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://eewd32.api.infobip.com/sms/3/messages");
    expect(init?.headers).toMatchObject({
      Authorization: "App a-private-api-key-with-at-least-32-characters",
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    const payload = JSON.parse(String(init?.body));
    expect(payload.messages[0].sender).toBe("SUNNYSPORT");
    expect(payload.messages[0].destinations[0].to).toBe("85512345678");
    expect(payload.messages[0].content.text).toMatch(/\d{6}/);
    expect(await response.json()).not.toHaveProperty("code");
  });

  it("invalidates the OTP and returns a safe response when Infobip times out", async () => {
    vi.stubEnv("INFOBIP_API_KEY", "a-private-api-key-with-at-least-32-characters");
    vi.stubEnv("INFOBIP_BASE_URL", "eewd32.api.infobip.com");
    vi.stubEnv("INFOBIP_SENDER", "SUNNYSPORT");
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network timeout"));

    const response = await requestRecovery(postRequest("forgot-password", {
      identifier: "012 345 678",
      channel: "phone",
    }) as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty("code");
    expect(JSON.stringify(body)).not.toContain("network timeout");
    expect(mocks.state.challenges).toHaveLength(1);
    expect(mocks.state.challenges[0].usedAt).toBeInstanceOf(Date);
    expect(mocks.state.challenges[0].phoneCodeHash).toBe("");
  });

  it("invalidates the OTP when Infobip rejects the SMS request", async () => {
    vi.stubEnv("INFOBIP_API_KEY", "a-private-api-key-with-at-least-32-characters");
    vi.stubEnv("INFOBIP_BASE_URL", "eewd32.api.infobip.com");
    vi.stubEnv("INFOBIP_SENDER", "SUNNYSPORT");
    vi.mocked(fetch).mockResolvedValueOnce(new Response("provider error details", { status: 401 }));

    const response = await requestRecovery(postRequest("forgot-password", {
      identifier: "012 345 678",
      channel: "phone",
    }) as never);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty("code");
    expect(JSON.stringify(body)).not.toContain("provider error details");
    expect(mocks.state.challenges[0].usedAt).toBeInstanceOf(Date);
    expect(mocks.state.challenges[0].phoneCodeHash).toBe("");
  });

  it("sends email recovery through Infobip with server-side authorization", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "infobip");
    vi.stubEnv("EMAIL_FROM", "SUNNY SPORT CLUB <password-reset@sunny.test>");
    vi.stubEnv("INFOBIP_API_KEY", "a-private-api-key-with-at-least-32-characters");
    vi.stubEnv("INFOBIP_BASE_URL", "eewd32.api.infobip.com");
    vi.stubEnv("INFOBIP_FROM_EMAIL", "OukDom@selfserve.worlds-connected.co");
    vi.stubEnv("RESEND_API_KEY", "");

    const response = await requestRecovery(postRequest("forgot-password", {
      identifier: "customer@example.test",
      channel: "email",
    }) as never);
    expect(response.status).toBe(200);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://eewd32.api.infobip.com/email/4/messages");
    expect(init?.headers).toMatchObject({
      authorization: "App a-private-api-key-with-at-least-32-characters",
      "content-type": "application/json",
      accept: "application/json",
    });
    const payload = JSON.parse(String(init?.body));
    expect(payload.messages[0].destinations[0].to[0].destination).toBe("customer@example.test");
    expect(payload.messages[0].sender).toBe("OukDom@selfserve.worlds-connected.co");
    expect(payload.messages[0].content.subject).toBe("Reset your SUNNY SPORT CLUB password");
    expect(await response.json()).not.toHaveProperty("code");
  });

  it("does not leave an active OTP when the selected email provider rejects delivery", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("rejected", { status: 401 }));
    const response = await requestRecovery(postRequest("forgot-password", {
      identifier: "customer@example.test",
      channel: "email",
    }) as never);
    expect(response.status).toBe(200);
    expect(await response.json()).not.toHaveProperty("code");
    expect(mocks.state.challenges).toHaveLength(1);
    expect(mocks.state.challenges[0].usedAt).toBeInstanceOf(Date);
    expect(mocks.state.challenges[0].emailCodeHash).toBe("");
  });

  it("verifies an OTP once, resets the password, revokes sessions, and rejects token reuse", async () => {
    const { response, code } = await requestEmailCode();
    expect(response.status).toBe(200);
    expect(mocks.state.challenges).toHaveLength(1);
    expect(JSON.stringify(mocks.state.challenges)).not.toContain(code);

    const verification = await verifyRecoveryCode(postRequest("customer/verify-reset-code", {
      identifier: "customer@example.test",
      channel: "email",
      code,
    }) as never);
    expect(verification.status).toBe(200);
    const { resetToken } = await verification.json() as { resetToken: string };
    expect(resetToken).toBeTruthy();
    expect(JSON.stringify(mocks.state.challenges)).not.toContain(resetToken);
    expect(mocks.state.challenges[0].resetTokenHash).not.toBe(resetToken);
    expect(mocks.state.challenges[0].verifiedAt).toBeInstanceOf(Date);

    const repeatedCode = await verifyRecoveryCode(postRequest("customer/verify-reset-code", {
      identifier: "customer@example.test",
      channel: "email",
      code,
    }) as never);
    expect(repeatedCode.status).toBe(400);

    const passwordResponse = await resetPassword(postRequest("customer/reset-password", {
      resetToken,
      password: "NewPass123",
      confirmPassword: "NewPass123",
    }) as never);
    expect(passwordResponse.status).toBe(200);
    expect(await passwordResponse.json()).toEqual({ passwordReset: true });
    const account = mocks.state.accounts[0];
    expect(account.sessionVersion).toBe(1);
    expect(account.passwordHash).not.toBe("NewPass123");
    await expect(verifyCustomerPassword("NewPass123", String(account.passwordHash))).resolves.toBe(true);

    const replay = await resetPassword(postRequest("customer/reset-password", {
      resetToken,
      password: "Another123",
      confirmPassword: "Another123",
    }) as never);
    expect(replay.status).toBe(400);
  });

  it("allows customer login with the reset password and preserves unrelated accounts", async () => {
    const originalPassword = "OriginalPass1";
    const replacementPassword = "ReplacePass2";
    const unrelatedHash = await hashCustomerPassword("UnrelatedPass3");
    mocks.state.accounts.push({
      id: "unrelated-customer",
      name: "Unrelated Customer",
      email: "unrelated@example.test",
      phone: "+85598765432",
      passwordHash: unrelatedHash,
      sessionVersion: 0,
    });

    const registration = await registerCustomer(postRequest("customer/register", {
      name: "New Test Customer",
      email: "new-customer@example.test",
      password: originalPassword,
    }) as never);
    expect(registration.status).toBe(201);
    const registered = mocks.state.accounts.find((account) => account.email === "new-customer@example.test");
    expect(registered).toBeTruthy();

    const originalLogin = await customerLogin(postRequest("customer/login", {
      identifier: "NEW-CUSTOMER@example.test",
      password: originalPassword,
    }) as never);
    expect(originalLogin.status).toBe(200);

    const { response, code } = await requestEmailCode("new-customer@example.test");
    expect(response.status).toBe(200);
    const verification = await verifyRecoveryCode(postRequest("customer/verify-reset-code", {
      identifier: "new-customer@example.test",
      channel: "email",
      code,
    }) as never);
    expect(verification.status).toBe(200);
    const { resetToken } = await verification.json() as { resetToken: string };
    const reset = await resetPassword(postRequest("customer/reset-password", {
      resetToken,
      password: replacementPassword,
      confirmPassword: replacementPassword,
    }) as never);
    expect(reset.status).toBe(200);

    const targetAfterReset = mocks.state.accounts.find((account) => account.email === "new-customer@example.test")!;
    expect({
      id: targetAfterReset.id,
      name: targetAfterReset.name,
      email: targetAfterReset.email,
      phone: targetAfterReset.phone,
      sessionVersion: targetAfterReset.sessionVersion,
    }).toEqual({
      id: registered!.id,
      name: "New Test Customer",
      email: "new-customer@example.test",
      phone: null,
      sessionVersion: 1,
    });
    expect(mocks.state.accounts.find((account) => account.id === "unrelated-customer")!.passwordHash).toBe(unrelatedHash);

    const oldPasswordLogin = await customerLogin(postRequest("customer/login", {
      identifier: "new-customer@example.test",
      password: originalPassword,
    }) as never);
    expect(oldPasswordLogin.status).toBe(401);

    const incorrectPasswordLogin = await customerLogin(postRequest("customer/login", {
      identifier: "new-customer@example.test",
      password: "Incorrect-customer-pass-4",
    }) as never);
    expect(incorrectPasswordLogin.status).toBe(401);

    const newPasswordLogin = await customerLogin(postRequest("customer/login", {
      identifier: " NEW-CUSTOMER@example.test ",
      password: replacementPassword,
    }) as never);
    expect(newPasswordLogin.status).toBe(200);

    const unrelatedLogin = await customerLogin(postRequest("customer/login", {
      identifier: "unrelated@example.test",
      password: "UnrelatedPass3",
    }) as never);
    expect(unrelatedLogin.status).toBe(200);
  });

  it("counts failed codes and locks the challenge after five attempts", async () => {
    const { code } = await requestEmailCode();
    const incorrectCode = code === "000000" ? "000001" : "000000";
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await verifyRecoveryCode(postRequest("customer/verify-reset-code", {
        identifier: "customer@example.test",
        channel: "email",
        code: incorrectCode,
      }) as never);
      expect(response.status).toBe(400);
    }
    expect(mocks.state.challenges[0].attemptCount).toBe(5);
    expect(mocks.state.challenges[0].usedAt).toBeInstanceOf(Date);
    const locked = await verifyRecoveryCode(postRequest("customer/verify-reset-code", {
      identifier: "customer@example.test",
      channel: "email",
      code: "123456",
    }) as never);
    expect(locked.status).toBe(400);
    expect(mocks.state.challenges[0].resetTokenHash).toBeNull();
  });

  it("rejects expired OTPs through the verification endpoint", async () => {
    const { code } = await requestEmailCode();
    mocks.state.challenges[0].expiresAt = new Date(Date.now() - 1);
    const response = await verifyRecoveryCode(postRequest("customer/verify-reset-code", {
      identifier: "customer@example.test",
      channel: "email",
      code,
    }) as never);
    expect(response.status).toBe(400);
    expect(await response.json()).not.toHaveProperty("resetToken");
  });

  it("rate-limits OTP resends by account and invalidates earlier codes", async () => {
    await requestEmailCode();
    const first = mocks.state.challenges[0];
    await requestEmailCode();
    expect(first.usedAt).toBeInstanceOf(Date);
    await requestEmailCode();
    const limited = await requestRecovery(postRequest("forgot-password", {
      identifier: "customer@example.test",
      channel: "email",
    }) as never);
    expect(limited.status).toBe(429);
    expect(mocks.state.challenges).toHaveLength(3);
    expect(mocks.state.limits.every((entry) => !String(entry.key).includes("customer@example.test"))).toBe(true);
  });

  it("applies the resend limit across both registered recovery methods", async () => {
    await requestEmailCode();
    await requestEmailCode();
    await requestEmailCode();
    vi.stubEnv("SMS_PROVIDER", "twilio");
    vi.stubEnv("TWILIO_SMS_ENABLED", "true");
    vi.stubEnv("TWILIO_ACCOUNT_SID", `AC${"a".repeat(32)}`);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "b".repeat(32));
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+855123456789");
    const response = await requestRecovery(postRequest("forgot-password", {
      identifier: "+85512345678",
      channel: "phone",
    }) as never);
    expect(response.status).toBe(200);
    expect(mocks.state.challenges).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("rejects password reset without valid server-issued authorization", async () => {
    const response = await resetPassword(postRequest("customer/reset-password", {
      resetToken: "x".repeat(43),
      password: "NewPass123",
      confirmPassword: "NewPass123",
    }) as never);
    expect(response.status).toBe(400);
    expect(mocks.state.accounts[0].passwordHash).toBe("old-hash");
  });

  it("rejects mismatched confirmation before changing the account", async () => {
    const response = await resetPassword(postRequest("customer/reset-password", {
      resetToken: "x".repeat(43),
      password: "NewPass123",
      confirmPassword: "Different123",
    }) as never);
    expect(response.status).toBe(400);
    expect(mocks.state.accounts[0].passwordHash).toBe("old-hash");
  });
});
