import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hashCustomerPassword,
  hasCustomerDeliveryConfiguration,
  hasCustomerRecoveryConfiguration,
  customerAccountIdentifierSchema,
  customerCambodianPhoneSchema,
  customerPhoneSchema,
  isCustomerAuthChallengeValid,
  isCustomerAuthRateLimited,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
  verifyCustomerPassword,
} from "./customer-auth";

afterEach(() => {
  vi.unstubAllEnvs();
});

function hashCode(code: string, secret: string) {
  return createHmac("sha256", secret).update(code).digest("hex");
}

describe("customer accounts", () => {
  it("normalizes email and Cambodian phone numbers", () => {
    expect(normalizeCustomerEmail("  Dara@Example.COM ")).toBe("dara@example.com");
    expect(normalizeCustomerPhone("012 345 678")).toBe("+85512345678");
    expect(normalizeCustomerPhone("+855 12 345 678")).toBe("+85512345678");
    expect(normalizeCustomerPhone("+855 (12) 345-678")).toBe("+85512345678");
  });

  it("accepts one valid email or phone number as an account identifier", () => {
    expect(customerAccountIdentifierSchema.safeParse("dara@example.com").success).toBe(true);
    expect(customerAccountIdentifierSchema.safeParse("012 345 678").success).toBe(true);
    expect(customerAccountIdentifierSchema.safeParse("not-an-email").success).toBe(false);
    expect(customerAccountIdentifierSchema.safeParse("abc@").success).toBe(false);
  });

  it("validates phone numbers for customer registration", () => {
    expect(customerPhoneSchema.safeParse("012 345 678").success).toBe(true);
    expect(customerPhoneSchema.safeParse("+855 12 345 678").success).toBe(true);
    expect(customerPhoneSchema.safeParse("not-a-phone").success).toBe(false);
    expect(customerPhoneSchema.safeParse("dara@example.com").success).toBe(false);
  });

  it("accepts only well-formed Cambodian numbers for SMS recovery", () => {
    expect(customerCambodianPhoneSchema.safeParse("012 345 678").success).toBe(true);
    expect(customerCambodianPhoneSchema.safeParse("+855 12 345 678").success).toBe(true);
    expect(customerCambodianPhoneSchema.safeParse("abc+85512345678").success).toBe(false);
    expect(customerCambodianPhoneSchema.safeParse("+12025550123").success).toBe(false);
  });

  it("hashes passwords and verifies only the correct password", async () => {
    const stored = await hashCustomerPassword("StrongPassword123");
    expect(stored).toMatch(/^scrypt\$[a-f0-9]+\$[a-f0-9]{128}$/);
    expect(stored).not.toContain("StrongPassword123");
    await expect(verifyCustomerPassword("StrongPassword123", stored)).resolves.toBe(true);
    await expect(verifyCustomerPassword("WrongPassword", stored)).resolves.toBe(false);
  });

  it("validates a single contact-specific password reset code", () => {
    const secret = "test-session-secret-that-is-at-least-32-chars";
    vi.stubEnv("SESSION_SECRET", secret);
    const emailChallenge = {
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      emailCodeHash: hashCode("123456", secret),
      phoneCodeHash: "",
    };
    expect(isCustomerAuthChallengeValid(emailChallenge, "123456")).toBe(true);
    expect(isCustomerAuthChallengeValid(emailChallenge, "000000")).toBe(false);
    expect(isCustomerAuthChallengeValid({ ...emailChallenge, usedAt: new Date() }, "123456")).toBe(false);
    expect(isCustomerAuthChallengeValid({ ...emailChallenge, expiresAt: new Date(0) }, "123456")).toBe(false);
    expect(isCustomerAuthChallengeValid({
      ...emailChallenge,
      emailCodeHash: "",
      phoneCodeHash: hashCode("654321", secret),
    }, "654321")).toBe(true);
    expect(isCustomerAuthChallengeValid({
      ...emailChallenge,
      phoneCodeHash: hashCode("654321", secret),
    }, "123456")).toBe(false);
  });

  it("rate-limits repeated account actions", () => {
    const key = `test-${Date.now()}`;
    expect(isCustomerAuthRateLimited("test", key, 2, 60_000)).toBe(false);
    expect(isCustomerAuthRateLimited("test", key, 2, 60_000)).toBe(false);
    expect(isCustomerAuthRateLimited("test", key, 2, 60_000)).toBe(true);
  });

  it("does not treat example provider settings as real delivery credentials", () => {
    vi.stubEnv("SESSION_SECRET", "a-session-secret-that-is-at-least-32-characters");
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    vi.stubEnv("EMAIL_FROM", "SUNNY SPORT CLUB <no-reply@example.com>");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_USER", "replace-with-smtp-username");
    vi.stubEnv("SMTP_PASSWORD", "replace-with-smtp-password");
    vi.stubEnv("SMS_PROVIDER", "twilio");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC00000000000000000000000000000000");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "replace-with-twilio-auth-token");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+15555550100");
    expect(hasCustomerDeliveryConfiguration()).toBe(false);

    vi.stubEnv("SMTP_HOST", "smtp.sunnyclub.test");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "mail-user");
    vi.stubEnv("SMTP_PASSWORD", "secret-value");
    vi.stubEnv("EMAIL_FROM", "bookings@sunnyclub.test");
    vi.stubEnv("TWILIO_ACCOUNT_SID", `AC${"a".repeat(32)}`);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "b".repeat(32));
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+855123456789");
    vi.stubEnv("TWILIO_SMS_ENABLED", "true");
    expect(hasCustomerDeliveryConfiguration()).toBe(true);
    expect(hasCustomerRecoveryConfiguration("email")).toBe(true);
    expect(hasCustomerRecoveryConfiguration("phone")).toBe(true);
  });

  it("checks email and phone recovery providers independently", () => {
    vi.stubEnv("SESSION_SECRET", "a-session-secret-that-is-at-least-32-characters");
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    vi.stubEnv("EMAIL_FROM", "bookings@sunnyclub.test");
    vi.stubEnv("SMS_PROVIDER", "twilio");
    vi.stubEnv("SMTP_HOST", "smtp.sunnyclub.test");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "mail-user");
    vi.stubEnv("SMTP_PASSWORD", "secret-value");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    vi.stubEnv("TWILIO_PHONE_NUMBER", "");
    vi.stubEnv("TWILIO_SMS_ENABLED", "false");

    expect(hasCustomerRecoveryConfiguration("email")).toBe(true);
    expect(hasCustomerRecoveryConfiguration("phone")).toBe(false);
    expect(hasCustomerDeliveryConfiguration()).toBe(true);

    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("TWILIO_ACCOUNT_SID", `AC${"a".repeat(32)}`);
    vi.stubEnv("TWILIO_AUTH_TOKEN", "b".repeat(32));
    vi.stubEnv("TWILIO_PHONE_NUMBER", "+855123456789");
    vi.stubEnv("TWILIO_SMS_ENABLED", "true");
    expect(hasCustomerRecoveryConfiguration("email")).toBe(false);
    expect(hasCustomerRecoveryConfiguration("phone")).toBe(true);
  });

  it("recognizes complete Infobip email configuration and rejects an invalid API hostname", () => {
    vi.stubEnv("SESSION_SECRET", "a-session-secret-that-is-at-least-32-characters");
    vi.stubEnv("EMAIL_PROVIDER", "infobip");
    vi.stubEnv("EMAIL_FROM", "password-reset@sunny.test");
    vi.stubEnv("INFOBIP_API_KEY", "a-private-api-key-with-at-least-32-characters");
    vi.stubEnv("INFOBIP_BASE_URL", "eewd32.api.infobip.com");
    vi.stubEnv("INFOBIP_FROM_EMAIL", "OukDom@selfserve.worlds-connected.co");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASSWORD", "");

    expect(hasCustomerRecoveryConfiguration("email")).toBe(true);
    vi.stubEnv("INFOBIP_BASE_URL", "localhost");
    expect(hasCustomerRecoveryConfiguration("email")).toBe(false);
  });
});
