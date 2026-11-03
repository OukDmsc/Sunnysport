import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EmailDeliveryError,
  getEmailProviderConfigurationDiagnostic,
  sendOtpEmail,
} from "./email";

afterEach(() => {
  vi.restoreAllMocks();
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

  it("logs sanitized Infobip error details while preserving the delivery error", async () => {
    const apiKey = "a-private-api-key-with-at-least-32-characters";
    const otpCode = "123456";
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("EMAIL_PROVIDER", "infobip");
    vi.stubEnv("INFOBIP_FROM_EMAIL", "password-reset@sunny.test");
    vi.stubEnv("INFOBIP_API_KEY", apiKey);
    vi.stubEnv("INFOBIP_BASE_URL", "eewd32.api.infobip.com");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      requestError: {
        serviceException: {
          text: `OTP ${otpCode} was rejected`,
          apiKey,
          authorization: `App ${apiKey}`,
        },
      },
    }), { status: 422 })));

    await expect(sendOtpEmail({
      to: "customer@sunny.test",
      name: "Test",
      code: otpCode,
    })).rejects.toMatchObject({
      name: "EmailDeliveryError",
      provider: "infobip",
      reason: "rejected",
      message: "Email delivery failed: rejected.",
    });

    expect(logError).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith("Infobip email request rejected", {
      status: 422,
      body: {
        requestError: {
          serviceException: {
            text: "OTP [REDACTED] was rejected",
            apiKey: "[REDACTED]",
            authorization: "[REDACTED]",
          },
        },
      },
    });
    expect(JSON.stringify(logError.mock.calls)).not.toContain(apiKey);
    expect(JSON.stringify(logError.mock.calls)).not.toContain(otpCode);
  });

  it("logs a sanitized successful-response body when Infobip does not accept the message", async () => {
    const apiKey = "a-private-api-key-with-at-least-32-characters";
    const otpCode = "654321";
    const logError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("EMAIL_PROVIDER", "infobip");
    vi.stubEnv("INFOBIP_FROM_EMAIL", "password-reset@sunny.test");
    vi.stubEnv("INFOBIP_API_KEY", apiKey);
    vi.stubEnv("INFOBIP_BASE_URL", "eewd32.api.infobip.com");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      messages: [{
        status: { name: "MESSAGE_REJECTED", description: `OTP ${otpCode} was rejected` },
        apiKey,
        secret: apiKey,
        token: apiKey,
        password: apiKey,
        credentials: apiKey,
      }],
    }), { status: 200 })));

    await expect(sendOtpEmail({
      to: "customer@sunny.test",
      name: "Test",
      code: otpCode,
    })).rejects.toMatchObject({
      name: "EmailDeliveryError",
      provider: "infobip",
      reason: "rejected",
      message: "Email delivery failed: rejected.",
    });

    expect(logError).toHaveBeenCalledOnce();
    expect(logError).toHaveBeenCalledWith("Infobip email response was not accepted", {
      messages: [{
        status: { name: "MESSAGE_REJECTED", description: "OTP [REDACTED] was rejected" },
        apiKey: "[REDACTED]",
        secret: "[REDACTED]",
        token: "[REDACTED]",
        password: "[REDACTED]",
        credentials: "[REDACTED]",
      }],
    });
    expect(JSON.stringify(logError.mock.calls)).not.toContain(apiKey);
    expect(JSON.stringify(logError.mock.calls)).not.toContain(otpCode);
  });
});
