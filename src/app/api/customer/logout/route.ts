import { NextRequest, NextResponse } from "next/server";
import { clearCustomerCookie, hasTrustedOrigin } from "@/lib/auth";

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  clearCustomerCookie(response);
  return response;
}
