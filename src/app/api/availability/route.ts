import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const fieldId = request.nextUrl.searchParams.get("fieldId");
  const date = request.nextUrl.searchParams.get("date");
  if (!fieldId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "A field and valid date are required." }, { status: 400 });
  }
  const rows = await db.bookingSlot.findMany({
    where: {
      fieldId,
      date,
      booking: { status: { not: "CANCELLED" } },
    },
    select: { time: true },
  });
  return NextResponse.json({ unavailable: rows.map((row) => row.time) });
}
