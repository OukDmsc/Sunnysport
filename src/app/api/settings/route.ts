import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hasTrustedOrigin, isAdminRequest, unauthorized } from "@/lib/auth";
import { hasCustomerRecoveryConfiguration } from "@/lib/customer-auth";
import { hasDynamicKhqrConfiguration, isDynamicKhqrConfigured } from "@/lib/khqr";
import { PLAYING_HOURS } from "@/lib/booking";
import { isTelegramConfigured } from "@/lib/notifications";

const settingsSchema = z.object({
  usdToKhrRate: z.number().int().min(1000).max(10000),
});

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) return unauthorized();
  const rows = await db.setting.findMany();
  const saved = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return NextResponse.json({
    openingHours: PLAYING_HOURS,
    usdToKhrRate: Number(saved.usdToKhrRate ?? process.env.USD_TO_KHR_RATE ?? "4100"),
    paymentMode: "Manual KHQR — admin verification required",
    telegramConfigured: isTelegramConfigured(),
    khqrConfigured: Boolean(process.env.KHQR_IMAGE_URL || process.env.KHQR_PAYMENT_URL || isDynamicKhqrConfigured()),
    khqrAmountPrefillConfigured: isDynamicKhqrConfigured(),
    khqrDynamicConfigurationStarted: hasDynamicKhqrConfiguration(),
    emailRecoveryConfigured: hasCustomerRecoveryConfiguration("email"),
    phoneRecoveryConfigured: hasCustomerRecoveryConfiguration("phone"),
  });
}

export async function PUT(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  if (!(await isAdminRequest(request))) return unauthorized();
  try {
    const values = settingsSchema.parse(await request.json());
    await db.$transaction([
      db.setting.upsert({ where: { key: "usdToKhrRate" }, update: { value: String(values.usdToKhrRate) }, create: { key: "usdToKhrRate", value: String(values.usdToKhrRate) } }),
    ]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Settings update failed:", error);
    return NextResponse.json({ error: "Settings were invalid or could not be saved." }, { status: 400 });
  }
}
