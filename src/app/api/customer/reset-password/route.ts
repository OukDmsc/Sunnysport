import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { hasTrustedOrigin } from "@/lib/auth";
import { consumeCustomerAuthRateLimit, hashCustomerPassword, hashCustomerResetToken } from "@/lib/customer-auth";
import { db } from "@/lib/db";

const resetSchema = z.object({
  resetToken: z.string().min(40).max(100),
  password: z.string().min(8).max(16),
  confirmPassword: z.string().min(8).max(16),
}).refine((value) => value.password === value.confirmPassword, { path: ["confirmPassword"] });
const invalidToken = { error: "Password reset authorization is invalid or expired. Verify a new recovery code." };

function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) || "unknown";
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Password reset request must be valid JSON." }, { status: 400 });
  }
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter matching passwords between 8 and 16 characters." }, { status: 400 });
  }

  try {
    const tokenHash = hashCustomerResetToken(parsed.data.resetToken);
    const ip = requestIp(request);
    const endpointLimited = await consumeCustomerAuthRateLimit("recovery-reset-endpoint", "all", 100, 60 * 60 * 1000);
    const ipLimited = await consumeCustomerAuthRateLimit("recovery-reset-ip", ip, 20, 60 * 60 * 1000);
    const tokenLimited = await consumeCustomerAuthRateLimit("recovery-reset-token", tokenHash, 5, 15 * 60 * 1000);
    if (endpointLimited || ipLimited || tokenLimited) {
      return NextResponse.json({ error: "Too many password reset attempts. Try again later." }, { status: 429 });
    }

    const challenge = await db.customerAuthChallenge.findUnique({
      where: { resetTokenHash: tokenHash },
      select: { id: true, customerAccountId: true, verifiedAt: true, usedAt: true, resetTokenExpiresAt: true },
    });
    const now = new Date();
    if (!challenge || !challenge.verifiedAt || challenge.usedAt || !challenge.resetTokenExpiresAt || challenge.resetTokenExpiresAt <= now) {
      return NextResponse.json(invalidToken, { status: 400 });
    }

    const passwordHash = await hashCustomerPassword(parsed.data.password);
    const changed = await db.$transaction(async (tx) => {
      const claimed = await tx.customerAuthChallenge.updateMany({
        where: {
          id: challenge.id,
          resetTokenHash: tokenHash,
          verifiedAt: { not: null },
          usedAt: null,
          resetTokenExpiresAt: { gt: now },
        },
        data: { usedAt: now, resetTokenHash: null, resetTokenExpiresAt: null },
      });
      if (claimed.count !== 1) return false;

      await tx.customerAccount.update({
        where: { id: challenge.customerAccountId },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      });
      await tx.customerAuthChallenge.updateMany({
        where: { customerAccountId: challenge.customerAccountId, purpose: "PASSWORD_RESET", usedAt: null },
        data: { usedAt: now, resetTokenHash: null, resetTokenExpiresAt: null, emailCodeHash: "", phoneCodeHash: "" },
      });
      return true;
    });
    if (!changed) return NextResponse.json(invalidToken, { status: 400 });

    return NextResponse.json({ passwordReset: true });
  } catch {
    console.error("Customer password reset could not be completed.");
    return NextResponse.json({ error: "Unable to reset the customer password right now." }, { status: 500 });
  }
}
