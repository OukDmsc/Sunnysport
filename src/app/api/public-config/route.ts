import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PLAYING_HOURS } from "@/lib/booking";

export async function GET() {
  const rate = await db.setting.findUnique({ where: { key: "usdToKhrRate" } });
  return NextResponse.json({
    openingHours: PLAYING_HOURS,
    usdToKhrRate: Number(rate?.value ?? process.env.USD_TO_KHR_RATE ?? "4100"),
  });
}
