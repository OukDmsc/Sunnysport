import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmailDeliveryError,
  getEmailProviderConfigurationDiagnostic,
  sendOtpEmail,
} from "./email";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("customer recovery email provider configuration", () => {
  it("reports missing provider selection without exposing environment values", () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    vi.stubEnv("RESEND_API_KEY", "private-test-value");

    expect(getEmailProviderConfigurationDiagnostic()).toEqual({
      provider: null,
      configured: false,
      missing: ["EMAIL_PROVIDER"],
    });
  });

  it("accepts configured Resend credentials and the canonical sender variable", () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("EMAIL_FROM", "SUNNY SPORT CLUB <password-reset@sunny.test>");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    expect(getEmailProviderConfigurationDiagnostic()).toEqual({
      provider: "resend",
      configured: true,
      missing: [],
    });
  });

  it("supports the prior Resend sender variable for existing deployments", () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "password-reset@sunny.test");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");

    expect(getEmailProviderConfigurationDiagnostic().configured).toBe(true);
  });

  it("does not require the generic sender for Infobip email", () => {
    vi.stubEnv("EMAIL_PROVIDER", "infobip");
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("INFOBIP_FROM_EMAIL", "password-reset@sunny.test");
    vi.stubEnv("INFOBIP_API_KEY", "a-private-api-key-with-at-least-32-characters");
    vi.stubEnv("INFOBIP_BASE_URL", "eewd32.api.infobip.com");

    expect(getEmailProviderConfigurationDiagnostic()).toEqual({
      provider: "infobip",
      configured: true,
      missing: [],
    });
  });

  it("lists missing SMTP settings without revealing configured values", () => {
    vi.stubEnv("EMAIL_PROVIDER", "smtp");
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("SMTP_FROM", "");
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("SMTP_PORT", "");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASSWORD", "");

    expect(getEmailProviderConfigurationDiagnostic().missing).toEqual([
      "EMAIL_FROM (or SMTP_FROM)",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASSWORD",
    ]);
  });

  it("classifies Resend authentication failures without exposing provider response details", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("EMAIL_FROM", "SUNNY SPORT CLUB <password-reset@sunny.test>");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private response", { status: 401 })));

    await expect(sendOtpEmail({
      to: "customer@sunny.test",
      name: "Test",
      code: "123456",
    })).rejects.toMatchObject({
      name: "EmailDeliveryError",
      provider: "resend",
      reason: "authentication",
    });
  });
});
