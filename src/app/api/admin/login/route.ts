import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminToken, hasTrustedOrigin, isSessionSecretValid, setAdminCookie } from "@/lib/auth";
import { safeErrorDetails } from "@/lib/safe-error";

const attempts = new Map<string, { count: number; resetAt: number }>();

function constantTimeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const now = Date.now();
  const attempt = attempts.get(ip);
  if (attempt && attempt.resetAt > now && attempt.count >= 8) {
    return NextResponse.json({ error: "Too many login attempts. Try again in 15 minutes." }, { status: 429 });
  }
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Login request must be valid JSON." }, { status: 400 });
    }
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid login request." }, { status: 400 });
    const { username, password } = body as Record<string, unknown>;
    if (typeof username !== "string" || typeof password !== "string" || username.length > 100 || password.length > 200) {
      return NextResponse.json({ error: "Enter a valid username and password." }, { status: 400 });
    }
    const expectedUser = process.env.ADMIN_USERNAME;
    const expectedPassword = process.env.ADMIN_PASSWORD;
    if (!expectedUser || !expectedPassword) {
      console.error("Admin credentials are missing from the environment.");
      return NextResponse.json({ error: "Administrator login is not configured." }, { status: 503 });
    }
    if (!isSessionSecretValid()) {
      console.error("Administrator session configuration is unavailable.");
      return NextResponse.json({ error: "Administrator login is temporarily unavailable." }, { status: 503 });
    }
    if (!constantTimeEqual(username, expectedUser) || !constantTimeEqual(password, expectedPassword)) {
      const next = attempt && attempt.resetAt > now
        ? { count: attempt.count + 1, resetAt: attempt.resetAt }
        : { count: 1, resetAt: now + 15 * 60 * 1000 };
      attempts.set(ip, next);
      return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
    }
    attempts.delete(ip);
    const response = NextResponse.json({ ok: true });
    setAdminCookie(response, await createAdminToken(username));
    return response;
  } catch (error) {
    console.error("Admin login failed.", safeErrorDetails(error));
    return NextResponse.json({ error: "Unable to sign in." }, { status: 500 });
  }
}
