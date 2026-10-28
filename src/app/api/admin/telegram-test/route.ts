import { NextRequest, NextResponse } from "next/server";
import { hasTrustedOrigin, isAdminRequest, unauthorized } from "@/lib/auth";
import { sendTelegramMessage } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  }
  if (!(await isAdminRequest(request))) return unauthorized();

  const result = await sendTelegramMessage("✅ SUNNY SPORT CLUB test message: Telegram group notifications are connected.");
  if (!result.delivered) {
    return NextResponse.json({ error: result.reason }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
