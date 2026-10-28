import { createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import nodemailer from "nodemailer";
import { z } from "zod";
import { NextRequest } from "next/server";
import { db } from "./db";
import { getCustomerSession } from "./auth";
import { hasEmailProviderConfiguration, sendOtpEmail } from "./customer-recovery/email";
import { hasSmsProviderConfiguration, sendOtpSms } from "./customer-recovery/sms";

const scrypt = promisify(scryptCallback);
const CODE_LIFETIME_MS = 5 * 60 * 1000;
export const CUSTOMER_RESET_TOKEN_LIFETIME_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const authAttempts = new Map<string, { count: number; resetAt: number }>();
let rateLimitCleanupCount = 0;

export function isCustomerAuthRateLimited(scope: string, key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const mapKey = `${scope}:${key}`;
  const current = authAttempts.get(mapKey);
  if (current && current.resetAt > now) {
    if (current.count >= limit) return true;
    current.count++;
  } else {
    authAttempts.set(mapKey, { count: 1, resetAt: now + windowMs });
  }
  if (authAttempts.size > 5000) {
    for (const [entryKey, entry] of authAttempts) {
      if (entry.resetAt <= now) authAttempts.delete(entryKey);
    }
  }
  return false;
}

export function normalizeCustomerEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeCustomerPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `+855${digits.slice(1)}` : `+${digits}`;
}

export const customerPhoneSchema = z.string().trim().min(7).max(24).refine((phone) =>
  /^[+0-9 ()-]{7,24}$/.test(phone) && /^\+\d{7,15}$/.test(normalizeCustomerPhone(phone)),
);

export const customerCambodianPhoneSchema = customerPhoneSchema.refine((phone) =>
  /^\+855\d{8,9}$/.test(normalizeCustomerPhone(phone)),
);

export const customerAccountIdentifierSchema = z.string().trim().min(3).max(254).refine((identifier) => {
  if (identifier.includes("@")) return z.string().email().max(254).safeParse(identifier).success;
  return customerPhoneSchema.safeParse(identifier).success;
});

export async function hashCustomerPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyCustomerPassword(password: string, stored: string) {
  const [algorithm, salt, hash] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !/^[a-f0-9]{128}$/i.test(hash ?? "")) return false;
  const derived = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, "hex");
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  return secret;
}

export function hashCustomerRecoveryCode(code: string) {
  return createHmac("sha256", sessionSecret()).update(code).digest("hex");
}

export function hashCustomerResetToken(token: string) {
  return createHmac("sha256", sessionSecret()).update(`customer-password-reset:${token}`).digest("hex");
}

function codesMatch(given: string, storedHash: string) {
  const actual = Buffer.from(hashCustomerRecoveryCode(given), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function consumeCustomerAuthRateLimit(scope: string, key: string, limit: number, windowMs: number) {
  const storageKey = createHmac("sha256", sessionSecret()).update(`${scope}:${key}`).digest("hex");
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);
  rateLimitCleanupCount++;
  if (rateLimitCleanupCount % 100 === 0) {
    await db.customerAuthRateLimit.deleteMany({
      where: { resetAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    });
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await db.customerAuthRateLimit.findUnique({ where: { key: storageKey } });
    if (!current) {
      try {
        await db.customerAuthRateLimit.create({ data: { key: storageKey, count: 1, resetAt } });
        return false;
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "P2002") continue;
        throw error;
      }
    }

    if (current.resetAt <= now) {
      const reset = await db.customerAuthRateLimit.updateMany({
        where: { key: storageKey, count: current.count, resetAt: current.resetAt },
        data: { count: 1, resetAt, updatedAt: now },
      });
      if (reset.count === 1) return false;
      continue;
    }
    if (current.count >= limit) return true;

    const incremented = await db.customerAuthRateLimit.updateMany({
      where: { key: storageKey, count: current.count, resetAt: current.resetAt },
      data: { count: { increment: 1 }, updatedAt: now },
    });
    if (incremented.count === 1) return false;
  }

  throw new Error("Unable to update the customer authentication rate limit.");
}

export function hasCustomerDeliveryConfiguration() {
  return hasCustomerRecoveryConfiguration("email") || hasCustomerRecoveryConfiguration("phone");
}

function hasResendEmailConfiguration() {
  const senderAddress = process.env.RESEND_FROM_EMAIL?.match(/<([^<>]+)>/)?.[1] ?? process.env.RESEND_FROM_EMAIL;
  return Boolean(
    process.env.RESEND_API_KEY
    && /^re_[a-z0-9_]+$/i.test(process.env.RESEND_API_KEY)
    && senderAddress
    && z.string().email().safeParse(senderAddress).success,
  );
}

function hasInfobipEmailConfiguration() {
  return Boolean(
    process.env.INFOBIP_API_KEY
    && process.env.INFOBIP_API_KEY.length >= 32
    && /^[a-z0-9.-]+\.api\.infobip\.com$/i.test(process.env.INFOBIP_BASE_URL ?? "")
    && z.string().email().safeParse(process.env.INFOBIP_FROM_EMAIL ?? "").success,
  );
}

export function hasCustomerRecoveryConfiguration(channel: "email" | "phone") {
  const secretIsConfigured = Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32);
  if (!secretIsConfigured) return false;
  return secretIsConfigured && (channel === "email"
    ? hasEmailProviderConfiguration()
    : hasSmsProviderConfiguration());
}

export function isCustomerAuthChallengeValid(
  challenge: {
    expiresAt: Date;
    usedAt: Date | null;
    emailCodeHash: string;
    phoneCodeHash: string;
    recoveryMethod?: string;
    attemptCount?: number;
    verifiedAt?: Date | null;
  },
  code: string,
) {
  const activeHash = challenge.recoveryMethod === "phone"
    ? challenge.phoneCodeHash
    : challenge.recoveryMethod === "email"
      ? challenge.emailCodeHash
      : challenge.emailCodeHash || challenge.phoneCodeHash;
  const hasSingleChannelHash = Boolean(challenge.emailCodeHash) !== Boolean(challenge.phoneCodeHash);
  return !challenge.usedAt
    && !challenge.verifiedAt
    && (challenge.attemptCount ?? 0) < MAX_CODE_ATTEMPTS
    && challenge.expiresAt.getTime() > Date.now()
    && hasSingleChannelHash
    && Boolean(activeHash)
    && codesMatch(code, activeHash);
}

export function generateCustomerRecoveryCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export async function createCustomerAuthChallenge(
  customer: { id: string },
  channel: "email" | "phone",
) {
  const code = generateCustomerRecoveryCode();
  const now = new Date();
  const challenge = await db.$transaction(async (tx) => {
    await tx.customerAuthChallenge.updateMany({
      where: { customerAccountId: customer.id, purpose: "PASSWORD_RESET", usedAt: null },
      data: { usedAt: now, resetTokenHash: null, resetTokenExpiresAt: null },
    });
    return tx.customerAuthChallenge.create({
      data: {
        customerAccountId: customer.id,
        purpose: "PASSWORD_RESET",
        recoveryMethod: channel,
        emailCodeHash: channel === "email" ? hashCustomerRecoveryCode(code) : "",
        phoneCodeHash: channel === "phone" ? hashCustomerRecoveryCode(code) : "",
        expiresAt: new Date(now.getTime() + CODE_LIFETIME_MS),
      },
    });
  });
  await db.customerAuthChallenge.deleteMany({
    where: {
      expiresAt: { lt: now },
      OR: [{ resetTokenExpiresAt: null }, { resetTokenExpiresAt: { lt: now } }],
    },
  });
  await db.customerAuthRateLimit.deleteMany({ where: { resetAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } });
  return { challenge, code };
}

async function sendCustomerAuthCodeLegacy(
  customer: { email: string | null; phone: string | null; name: string },
  code: string,
  channel: "email" | "phone",
) {
  if (channel === "email" && customer.email) {
    if (!hasCustomerRecoveryConfiguration("email")) throw new Error("No email provider is configured for customer password recovery.");
    if (hasInfobipEmailConfiguration()) {
      const baseUrl = process.env.INFOBIP_BASE_URL!;
      const response = await fetch(`https://${baseUrl}/email/4/messages`, {
        method: "POST",
        headers: {
          authorization: `App ${process.env.INFOBIP_API_KEY}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          messages: [{
            destinations: [{ to: [{ destination: customer.email }] }],
            sender: process.env.INFOBIP_FROM_EMAIL,
            content: {
              subject: "Reset your SUNNY SPORT CLUB password",
              text: `Hello ${customer.name}, your password reset code is ${code}. It expires in 5 minutes. If you did not request this, ignore this email and do not share the code.`,
              html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#17231e"><h1 style="color:#16784b">SUNNY SPORT CLUB</h1><h2>Password reset</h2><p>Use this one-time code to reset your password:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in <strong>5 minutes</strong>.</p><p>If you did not request a password reset, ignore this email. Never share this code with anyone.</p></div>`,
            },
          }],
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("The email provider rejected the recovery email.");
      return;
    }
    if (hasResendEmailConfiguration()) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL,
          to: [customer.email],
          subject: "Reset your SUNNY SPORT CLUB password",
          text: `Your password reset code is ${code}. It expires in 5 minutes. If you did not request this, ignore this email and do not share the code.`,
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#17231e"><h1 style="color:#16784b">SUNNY SPORT CLUB</h1><h2>Password reset</h2><p>Use this one-time code to reset your password:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in <strong>5 minutes</strong>.</p><p>If you did not request a password reset, ignore this email. Never share this code with anyone.</p></div>`,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error("The email provider rejected the recovery email.");
      return;
    }
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: customer.email,
      subject: "Reset your SUNNY SPORT CLUB password",
      text: `Hello ${customer.name},\n\nYour password reset code is ${code}. It expires in 5 minutes. If you did not request this, ignore this message and do not share the code.`,
    });
    return;
  }
  if (channel === "phone" && customer.phone) {
    if (!hasCustomerRecoveryConfiguration("phone")) throw new Error("Twilio is not configured for customer password recovery.");
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const smsBody = new URLSearchParams({ To: customer.phone, From: process.env.TWILIO_PHONE_NUMBER!, Body: `SUNNY SPORT CLUB password reset code: ${code}. Expires in 5 minutes. Do not share this code.` });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${accountSid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: smsBody,
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error("The SMS provider rejected the recovery message.");
    }
    return;
  }
  throw new Error(`Customer account has no ${channel} address for password recovery.`);
}

export async function sendCustomerAuthCode(
  customer: { email: string | null; phone: string | null; name: string },
  code: string,
  channel: "email" | "phone",
) {
  if (channel === "email" && customer.email) {
    await sendOtpEmail({ to: customer.email, name: customer.name, code });
    return;
  }
  if (channel === "phone" && customer.phone) {
    await sendOtpSms({ to: customer.phone, code });
    return;
  }
  throw new Error(`Customer account has no ${channel} address for password recovery.`);
}

export async function getCustomerAccountFromRequest(request: NextRequest) {
  const session = await getCustomerSession(request);
  if (!session) return null;
  const customer = await db.customerAccount.findUnique({
    where: { id: session.id },
    select: { id: true, name: true, email: true, phone: true, sessionVersion: true },
  });
  if (!customer || customer.sessionVersion !== session.sessionVersion) return null;
  return customer;
}
