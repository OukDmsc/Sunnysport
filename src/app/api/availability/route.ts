import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { safeErrorDetails } from "@/lib/safe-error";

export async function GET(request: NextRequest) {
  const fieldId = request.nextUrl.searchParams.get("fieldId");
  const date = request.nextUrl.searchParams.get("date");
  const parsedDate = date ? new Date(`${date}T00:00:00.000Z`) : null;
  if (
    !fieldId
    || !date
    || !parsedDate
    || Number.isNaN(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== date
  ) {
    return NextResponse.json({ error: "A field and valid date are required." }, { status: 400 });
  }
  try {
    const rows = await db.bookingSlot.findMany({
      where: {
        fieldId,
        date,
        booking: { status: { not: "CANCELLED" } },
      },
      select: { time: true },
    });
    return NextResponse.json({ unavailable: rows.map((row) => row.time) });
  } catch (error) {
    console.error("Booking availability could not be loaded.", safeErrorDetails(error));
    return NextResponse.json({ error: "Unable to load field availability." }, { status: 500 });
  }
}
