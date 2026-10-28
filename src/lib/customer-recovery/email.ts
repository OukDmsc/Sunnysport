import nodemailer from "nodemailer";
import { z } from "zod";

type EmailProvider = "resend" | "smtp" | "infobip";
export type EmailDeliveryFailureReason = "configuration" | "authentication" | "rejected" | "timeout" | "network" | "invalid-response";

export class EmailDeliveryError extends Error {
  constructor(
    readonly provider: EmailProvider | "unknown",
    readonly reason: EmailDeliveryFailureReason,
  ) {
    super(`Email delivery failed: ${reason}.`);
    this.name = "EmailDeliveryError";
  }
}

export type EmailProviderConfigurationDiagnostic = {
  provider: EmailProvider | null;
  configured: boolean;
  missing: string[];
};

function configuredProvider(): EmailProvider | null {
  const provider = process.env.EMAIL_PROVIDER;
  return provider === "resend" || provider === "smtp" || provider === "infobip" ? provider : null;
}

function emailSender(provider: EmailProvider) {
  if (provider === "infobip") return process.env.INFOBIP_FROM_EMAIL;
  if (provider === "resend") return process.env.EMAIL_FROM || process.env.RESEND_FROM_EMAIL;
  return process.env.EMAIL_FROM || process.env.SMTP_FROM;
}

function validEmail(value: string | undefined) {
  return Boolean(value && z.string().email().safeParse(value).success);
}

function senderAddress(value: string | undefined) {
  return value?.match(/<([^<>]+)>/)?.[1] ?? value;
}

function validInfobipBaseUrl(value: string | undefined) {
  return Boolean(value && /^[a-z0-9.-]+\.api\.infobip\.com$/i.test(value));
}

export function getEmailProviderConfigurationDiagnostic(): EmailProviderConfigurationDiagnostic {
  const provider = configuredProvider();
  const missing: string[] = [];
  if (!provider) {
    missing.push(process.env.EMAIL_PROVIDER
      ? "EMAIL_PROVIDER (must be resend, smtp, or infobip)"
      : "EMAIL_PROVIDER");
    return { provider: null, configured: false, missing };
  }

  const sender = emailSender(provider);
  const senderLabel = provider === "infobip"
    ? "INFOBIP_FROM_EMAIL"
    : provider === "resend"
      ? "EMAIL_FROM (or RESEND_FROM_EMAIL)"
      : "EMAIL_FROM (or SMTP_FROM)";
  const address = senderAddress(sender);
  if (
    !validEmail(address)
    || /example\.com|your-verified-domain|replace-with/i.test(sender ?? "")
  ) missing.push(senderLabel);

  if (provider === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey || !/^re_[a-z0-9_]+$/i.test(apiKey) || /replace-with/i.test(apiKey)) {
      missing.push("RESEND_API_KEY");
    }
  } else if (provider === "smtp") {
    const port = Number(process.env.SMTP_PORT);
    if (!process.env.SMTP_HOST || /example\.com|replace-with/i.test(process.env.SMTP_HOST)) missing.push("SMTP_HOST");
    if (!Number.isInteger(port) || port < 1 || port > 65535) missing.push("SMTP_PORT");
    if (!process.env.SMTP_USER || /replace-with/i.test(process.env.SMTP_USER)) missing.push("SMTP_USER");
    if (!process.env.SMTP_PASSWORD || /replace-with/i.test(process.env.SMTP_PASSWORD)) missing.push("SMTP_PASSWORD");
    if (process.env.SMTP_SECURE && !["true", "false"].includes(process.env.SMTP_SECURE.toLowerCase())) {
      missing.push("SMTP_SECURE (must be true or false)");
    }
  } else {
    const apiKey = process.env.INFOBIP_API_KEY;
    if (!apiKey || apiKey.length < 32 || /replace-with/i.test(apiKey)) missing.push("INFOBIP_API_KEY");
    if (!validInfobipBaseUrl(process.env.INFOBIP_BASE_URL)) missing.push("INFOBIP_BASE_URL");
  }

  return { provider, configured: missing.length === 0, missing };
}

export function hasEmailProviderConfiguration() {
  return getEmailProviderConfigurationDiagnostic().configured;
}

function recoveryEmailHtml(code: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#17231e"><h1 style="color:#16784b">SUNNY SPORT CLUB</h1><h2>Password reset</h2><p>Use this one-time code to reset your password:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in <strong>5 minutes</strong>.</p><p>If you did not request a password reset, ignore this email. Never share this code with anyone.</p></div>`;
}

function providerFailure(provider: EmailProvider, response: Response): EmailDeliveryError {
  return new EmailDeliveryError(
    provider,
    response.status === 401 || response.status === 403 ? "authentication" : "rejected",
  );
}

async function providerFetch(provider: EmailProvider, input: RequestInfo | URL, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    const reason = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")
      ? "timeout"
      : "network";
    throw new EmailDeliveryError(provider, reason);
  }
  if (!response.ok) throw providerFailure(provider, response);
  return response;
}

async function ensureInfobipAccepted(response: Response) {
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new EmailDeliveryError("infobip", "invalid-response");
  }
  if (
    typeof result !== "object"
    || result === null
    || !("messages" in result)
    || !Array.isArray(result.messages)
    || result.messages.length !== 1
    || typeof result.messages[0] !== "object"
    || result.messages[0] === null
    || !("status" in result.messages[0])
    || typeof result.messages[0].status !== "object"
    || result.messages[0].status === null
    || !("name" in result.messages[0].status)
    || typeof result.messages[0].status.name !== "string"
    || !["PENDING_ACCEPTED", "MESSAGE_SENT"].includes(result.messages[0].status.name)
  ) {
    throw new EmailDeliveryError("infobip", "rejected");
  }
}

export async function sendOtpEmail(input: { to: string; name: string; code: string }) {
  const diagnostic = getEmailProviderConfigurationDiagnostic();
  if (!diagnostic.configured || !diagnostic.provider) {
    throw new EmailDeliveryError(diagnostic.provider ?? "unknown", "configuration");
  }

  const { provider } = diagnostic;
  const subject = "Reset your SUNNY SPORT CLUB password";
  const text = `Hello ${input.name}, your password reset code is ${input.code}. It expires in 5 minutes. If you did not request this, ignore this email and do not share the code.`;

  if (provider === "resend") {
    await providerFetch(provider, "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: emailSender(provider),
        to: [input.to],
        subject,
        text,
        html: recoveryEmailHtml(input.code),
      }),
      signal: AbortSignal.timeout(10000),
    });
    return;
  }

  if (provider === "smtp") {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
    try {
      await transporter.sendMail({
        from: emailSender(provider),
        to: input.to,
        subject,
        text,
        html: recoveryEmailHtml(input.code),
      });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : "";
      const reason: EmailDeliveryFailureReason = code === "EAUTH"
        ? "authentication"
        : code === "ETIMEDOUT" || code === "ESOCKET"
          ? "timeout"
          : code === "ECONNECTION" || code === "ECONNREFUSED" || code === "EHOSTUNREACH" || code === "ENOTFOUND"
            ? "network"
            : "rejected";
      throw new EmailDeliveryError(provider, reason);
    }
    return;
  }

  const response = await providerFetch(provider, `https://${process.env.INFOBIP_BASE_URL}/email/4/messages`, {
    method: "POST",
    headers: {
      authorization: `App ${process.env.INFOBIP_API_KEY}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      messages: [{
        destinations: [{ to: [{ destination: input.to }] }],
        sender: emailSender(provider),
        content: { subject, text, html: recoveryEmailHtml(input.code) },
      }],
    }),
    signal: AbortSignal.timeout(10000),
  });
  await ensureInfobipAccepted(response);
}
