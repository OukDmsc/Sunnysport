import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdminRequest, unauthorized } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) return unauthorized();
  const period = request.nextUrl.searchParams.get("period") ?? "week";
  if (period !== "day" && period !== "week" && period !== "month") {
    return NextResponse.json({ error: "Choose day, week, or month." }, { status: 400 });
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const start = new Date(today);
  if (period === "month") start.setUTCDate(1);
  else if (period === "week") start.setUTCDate(start.getUTCDate() - 6);
  const key = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  const startDate = key(start);
  const endDate = key(today);
  const bookings = await db.booking.findMany({ where: { date: { gte: startDate, lte: endDate } } });
  const revenueCents = bookings
    .filter((booking) => booking.paymentStatus === "PAID")
    .reduce((sum, booking) => sum + booking.amountPaidCents, 0);
  return NextResponse.json({
    period,
    startDate,
    bookingCount: bookings.length,
    revenueCents,
    pendingPayments: bookings.filter((booking) => booking.paymentStatus === "PENDING").length,
  });
}
