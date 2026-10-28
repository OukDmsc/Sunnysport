import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { createCustomerToken, hasTrustedOrigin, setCustomerCookie } from "@/lib/auth";
import { normalizeCustomerEmail, normalizeCustomerPhone, verifyCustomerPassword } from "@/lib/customer-auth";
import { db } from "@/lib/db";

const attempts = new Map<string, { count: number; resetAt: number }>();
const loginSchema = z.object({ identifier: z.string().trim().min(3).max(254), password: z.string().min(1).max(128) });

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const attempt = attempts.get(ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 8) {
    return NextResponse.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Sign-in request must be valid JSON." }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter your email or phone number and password." }, { status: 400 });
  try {
    const identifier = parsed.data.identifier;
    const customer = await db.customerAccount.findFirst({
      where: identifier.includes("@")
        ? { email: normalizeCustomerEmail(identifier) }
        : { phone: normalizeCustomerPhone(identifier) },
    });
    if (!customer) {
      attempts.set(ip, attempt && attempt.resetAt > now ? { count: attempt.count + 1, resetAt: attempt.resetAt } : { count: 1, resetAt: now + 15 * 60 * 1000 });
      return NextResponse.json({
        error: "You have not created an account, Please create your account now.",
        errorCode: "CUSTOMER_ACCOUNT_NOT_FOUND",
      }, { status: 401 });
    }
    const validPassword = await verifyCustomerPassword(parsed.data.password, customer.passwordHash);
    if (!validPassword) {
      attempts.set(ip, attempt && attempt.resetAt > now ? { count: attempt.count + 1, resetAt: attempt.resetAt } : { count: 1, resetAt: now + 15 * 60 * 1000 });
      return NextResponse.json({ error: "Email/phone or password is incorrect." }, { status: 401 });
    }
    attempts.delete(ip);
    const response = NextResponse.json({
      customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
    });
    setCustomerCookie(response, await createCustomerToken(customer.id, customer.sessionVersion));
    return response;
  } catch (error) {
    console.error("Customer sign-in failed:", error);
    return NextResponse.json({ error: "Unable to sign in right now." }, { status: 500 });
  }
}
