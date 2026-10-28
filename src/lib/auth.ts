import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const cookieName = "football_admin";
const customerCookieName = "football_customer";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  return new TextEncoder().encode(value);
}

export async function createAdminToken(username: string) {
  return new SignJWT({ role: "admin", username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
}

export async function createCustomerToken(customerId: string, sessionVersion: number) {
  return new SignJWT({ role: "customer", sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(customerId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
}

export async function getCustomerSession(request: NextRequest) {
  const token = request.cookies.get(customerCookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === "customer"
      && typeof payload.sub === "string"
      && typeof payload.sessionVersion === "number"
      ? { id: payload.sub, sessionVersion: payload.sessionVersion }
      : null;
  } catch {
    return null;
  }
}

export function setCustomerCookie(response: NextResponse, token: string) {
  response.cookies.set(customerCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
}

export function clearCustomerCookie(response: NextResponse) {
  response.cookies.set(customerCookieName, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
}

export async function isAdminRequest(request: NextRequest) {
  const token = request.cookies.get(cookieName)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === "admin" && typeof payload.username === "string";
  } catch {
    return false;
  }
}

export function setAdminCookie(response: NextResponse, token: string) {
  response.cookies.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
}

export function clearAdminCookie(response: NextResponse) {
  response.cookies.set(cookieName, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
}

export function hasTrustedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const requestHost = request.headers.get("host");
  if (!origin || !requestHost) return false;
  try {
    return new URL(origin).host === requestHost;
  } catch {
    return false;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "Administrator sign-in required." }, { status: 401 });
}
