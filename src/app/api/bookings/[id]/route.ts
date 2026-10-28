import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyAdmin } from "@/lib/notifications";
import { BOOKING_DURATION_HOURS, getBookingTimes } from "@/lib/booking";
import { isValidBookingDate } from "@/lib/validation";
import { hasTrustedOrigin, isAdminRequest, unauthorized } from "@/lib/auth";

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  if (!(await isAdminRequest(request))) return unauthorized();
  const { id } = await context.params;

  try {
    const current = await db.booking.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

    await db.$transaction(async (tx) => {
      const deleted = await tx.booking.deleteMany({
        where: {
          id,
          status: current.status,
          paymentStatus: current.paymentStatus,
          updatedAt: current.updatedAt,
        },
      });
      if (deleted.count !== 1) throw new Error("BOOKING_DELETE_CONFLICT");
    });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "BOOKING_DELETE_CONFLICT") {
      return NextResponse.json({ error: "This booking changed while you were deleting it. Refresh and try again." }, { status: 409 });
    }
    console.error("Booking deletion failed:", error);
    return NextResponse.json({ error: "Unable to delete booking history." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  if (!(await isAdminRequest(request))) return unauthorized();
  const { id } = await context.params;
  try {
    let body: Record<string, unknown>;
    try {
      const value: unknown = await request.json();
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return NextResponse.json({ error: "Booking update must be a JSON object." }, { status: 400 });
      }
      body = value as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Booking update must be valid JSON." }, { status: 400 });
    }
    const current = await db.booking.findUnique({ where: { id }, include: { field: true } });
    if (!current) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (current.status === "CANCELLED") return NextResponse.json({ error: "This booking is already cancelled." }, { status: 409 });
    if (body.action === "cancel") {
      const cancelled = await db.$transaction(async (tx) => {
        const changed = await tx.booking.updateMany({
          where: { id, status: current.status, paymentStatus: current.paymentStatus },
          data: {
            status: "CANCELLED",
            paymentStatus: current.paymentStatus === "PENDING" ? "CANCELLED" : current.paymentStatus,
          },
        });
        if (changed.count !== 1) throw new Error("BOOKING_UPDATE_CONFLICT");
        await tx.bookingSlot.deleteMany({ where: { bookingId: id } });
        const updated = await tx.booking.findUnique({ where: { id }, include: { field: true } });
        if (!updated) throw new Error("Booking disappeared during cancellation.");
        return updated;
      });
      const notification = await notifyAdmin(cancelled, "BOOKING CANCELLED");
      return NextResponse.json({ booking: cancelled, notification });
    }
    if (body.action !== "reschedule" || typeof body.date !== "string" || typeof body.startTime !== "string") {
      return NextResponse.json({ error: "Choose cancel or provide a valid new date and start time." }, { status: 400 });
    }
    if (!isValidBookingDate(body.date) || new Date(`${body.date}T${body.startTime}:00+07:00`).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Choose a valid future date and time." }, { status: 400 });
    }
    const date = body.date;
    const startTime = body.startTime;
    const { slots, endTime } = getBookingTimes(startTime, BOOKING_DURATION_HOURS);
    const updated = await db.$transaction(async (tx) => {
      await tx.bookingSlot.deleteMany({ where: { bookingId: id } });
      const changed = await tx.booking.updateMany({
        where: { id, status: current.status, date: current.date, startTime: current.startTime },
        data: {
          date,
          startTime,
          endTime,
          duration: BOOKING_DURATION_HOURS,
        },
      });
      if (changed.count !== 1) throw new Error("BOOKING_UPDATE_CONFLICT");
      await tx.bookingSlot.createMany({
        data: slots.map((time) => ({ bookingId: id, fieldId: current.fieldId, date, time })),
      });
      const result = await tx.booking.findUnique({ where: { id }, include: { field: true } });
      if (!result) throw new Error("Booking disappeared during rescheduling.");
      return result;
    });
    const notification = await notifyAdmin(updated, "BOOKING RESCHEDULED");
    return NextResponse.json({ booking: updated, notification });
  } catch (error) {
    if (error instanceof Error && error.message === "BOOKING_UPDATE_CONFLICT") {
      return NextResponse.json({ error: "This booking changed while you were editing it. Refresh and try again." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "The new time conflicts with another booking." }, { status: 409 });
    }
    if (error instanceof Error && /Bookings must|Choose a valid/.test(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Booking update failed:", error);
    return NextResponse.json({ error: "Unable to update booking." }, { status: 500 });
  }
}
