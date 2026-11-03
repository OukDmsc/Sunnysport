import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PLAYING_HOURS } from "@/lib/booking";
import { safeErrorDetails } from "@/lib/safe-error";

export async function GET() {
  try {
    const rate = await db.setting.findUnique({ where: { key: "usdToKhrRate" } });
    return NextResponse.json({
      openingHours: PLAYING_HOURS,
      usdToKhrRate: Number(rate?.value ?? process.env.USD_TO_KHR_RATE ?? "4100"),
    });
  } catch (error) {
    console.error("Public configuration could not be loaded.", safeErrorDetails(error));
    return NextResponse.json({ error: "Unable to load booking configuration." }, { status: 500 });
  }
}
