import { randomBytes } from "node:crypto";
import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { hasTrustedOrigin } from "@/lib/auth";
import {
  consumeCustomerAuthRateLimit,
  customerCambodianPhoneSchema,
  CUSTOMER_RESET_TOKEN_LIFETIME_MS,
  hashCustomerRecoveryCode,
  hashCustomerResetToken,
  isCustomerAuthChallengeValid,
  normalizeCustomerEmail,
  normalizeCustomerPhone,
} from "@/lib/customer-auth";
import { db } from "@/lib/db";

const verifySchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  channel: z.enum(["email", "phone"]),
  code: z.string().regex(/^\d{6}$/),
});
const invalidCode = { error: "The recovery code is invalid, expired, or already used." };

function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || "unknown";
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Verification request must be valid JSON." }, { status: 400 });
  }
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter the account contact and six-digit recovery code." }, { status: 400 });

  const { identifier, channel, code } = parsed.data;
  const normalized = channel === "email" ? normalizeCustomerEmail(identifier) : normalizeCustomerPhone(identifier);
  const validIdentifier = channel === "email"
    ? z.string().email().max(254).safeParse(normalized).success
    : customerCambodianPhoneSchema.safeParse(identifier).success;
  if (!validIdentifier) return NextResponse.json(invalidCode, { status: 400 });

  try {
    const ip = requestIp(request);
    const endpointLimited = await consumeCustomerAuthRateLimit("recovery-verify-endpoint", "all", 300, 60 * 60 * 1000);
    const ipLimited = await consumeCustomerAuthRateLimit("recovery-verify-ip", ip, 30, 60 * 60 * 1000);
    const accountLimited = await consumeCustomerAuthRateLimit("recovery-verify-account", normalized, 10, 60 * 60 * 1000);
    if (endpointLimited || ipLimited || accountLimited) {
      return NextResponse.json({ error: "Too many verification attempts. Request a new recovery code later." }, { status: 429 });
    }

    const customer = await db.customerAccount.findFirst({
      where: channel === "email" ? { email: normalized } : { phone: normalized },
      select: { id: true },
    });
    if (!customer) return NextResponse.json(invalidCode, { status: 400 });
    if (await consumeCustomerAuthRateLimit("recovery-verify-customer", customer.id, 10, 60 * 60 * 1000)) {
      return NextResponse.json(invalidCode, { status: 400 });
    }

    const challenge = await db.customerAuthChallenge.findFirst({
      where: {
        customerAccountId: customer.id,
        purpose: "PASSWORD_RESET",
        recoveryMethod: channel,
        usedAt: null,
        verifiedAt: null,
        expiresAt: { gt: new Date() },
        attemptCount: { lt: 5 },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge || !isCustomerAuthChallengeValid(challenge, code)) {
      if (challenge) {
        const now = new Date();
        await db.customerAuthChallenge.updateMany({
          where: {
            id: challenge.id,
            attemptCount: challenge.attemptCount,
            usedAt: null,
            verifiedAt: null,
            expiresAt: { gt: now },
          },
          data: {
            attemptCount: { increment: 1 },
            ...(challenge.attemptCount >= 4 ? { usedAt: now } : {}),
          },
        });
      }
      return NextResponse.json(invalidCode, { status: 400 });
    }

    const resetToken = randomBytes(32).toString("base64url");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CUSTOMER_RESET_TOKEN_LIFETIME_MS);
    const claimed = await db.customerAuthChallenge.updateMany({
      where: {
        id: challenge.id,
        attemptCount: challenge.attemptCount,
        usedAt: null,
        verifiedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        verifiedAt: now,
        resetTokenHash: hashCustomerResetToken(resetToken),
        resetTokenExpiresAt: expiresAt,
      },
    });
    if (claimed.count !== 1) return NextResponse.json(invalidCode, { status: 400 });

    return NextResponse.json({ resetToken, expiresInSeconds: CUSTOMER_RESET_TOKEN_LIFETIME_MS / 1000 });
  } catch {
    console.error("Customer recovery code verification failed.");
    return NextResponse.json({ error: "Unable to verify the recovery code right now." }, { status: 500 });
  }
}
