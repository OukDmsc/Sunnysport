import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashCustomerBookingAccessToken } from "@/lib/customer-booking-access";
import { notifyAdmin } from "@/lib/notifications";
import { canCustomerCancelBooking } from "@/lib/payment";
import { hasTrustedOrigin } from "@/lib/auth";
import { getCustomerAccountFromRequest, isCustomerAuthRateLimited } from "@/lib/customer-auth";

const customerBookingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("list"),
    tokens: z.array(z.string().regex(/^[a-f0-9]{64}$/i)).max(50),
  }),
  z.object({
    action: z.literal("cancel"),
    token: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    bookingId: z.string().min(1).max(40).optional(),
  }),
]);

function withoutPaymentTransactionReference<T extends { paymentTransactionReference?: unknown }>(booking: T) {
  const { paymentTransactionReference: _reference, ...customerBooking } = booking;
  return customerBooking;
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Booking request must be valid JSON." }, { status: 400 });
  }

  const parsed = customerBookingActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Provide valid booking access details." }, { status: 400 });

  try {
    if (parsed.data.action === "list") {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      if (isCustomerAuthRateLimited("customer-booking-status", ip, 20, 60_000)) {
        return NextResponse.json({ error: "Too many booking status checks. Please wait before trying again." }, {
          status: 429,
          headers: { "Retry-After": "60" },
        });
      }
      const tokenHashes = parsed.data.tokens.map(hashCustomerBookingAccessToken);
      const [accesses, customerSession] = await Promise.all([
        tokenHashes.length ? db.customerBookingAccess.findMany({
          where: { tokenHash: { in: tokenHashes } },
          include: { booking: { include: { field: true } } },
          orderBy: { booking: { createdAt: "desc" } },
        }) : Promise.resolve([]),
        getCustomerAccountFromRequest(request),
      ]);
      const accountBookings = customerSession ? await db.booking.findMany({
        where: { customerAccountId: customerSession.id },
        include: { field: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      }) : [];
      const byId = new Map([...accountBookings, ...accesses.map((access) => access.booking)].map((booking) => [booking.id, booking]));
      return NextResponse.json({
        bookings: [...byId.values()]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map(withoutPaymentTransactionReference),
      });
    }

    const customer = await getCustomerAccountFromRequest(request);
    let bookingId: string | null = null;
    let booking = null;
    if (parsed.data.bookingId && customer) {
      bookingId = parsed.data.bookingId;
      booking = await db.booking.findFirst({
        where: { id: bookingId, customerAccountId: customer.id },
        include: { field: true },
      });
    } else if (parsed.data.token) {
      const tokenHash = hashCustomerBookingAccessToken(parsed.data.token);
      const access = await db.customerBookingAccess.findUnique({
        where: { tokenHash },
        include: { booking: { include: { field: true } } },
      });
      bookingId = access?.bookingId ?? null;
      booking = access?.booking ?? null;
    }
    if (!booking || !bookingId) return NextResponse.json({ error: "Booking access could not be verified." }, { status: 404 });
    if (!canCustomerCancelBooking(booking.paymentStatus, booking.status)) {
      return NextResponse.json({ error: "Only unpaid, active bookings can be cancelled by the customer." }, { status: 409 });
    }

    const cancelledBooking = await db.$transaction(async (tx) => {
      const changed = await tx.booking.updateMany({
        where: { id: bookingId!, status: "PENDING", paymentStatus: "PENDING" },
        data: { status: "CANCELLED", paymentStatus: "CANCELLED" },
      });
      if (changed.count !== 1) throw new Error("CUSTOMER_CANCELLATION_CONFLICT");
      await tx.bookingSlot.deleteMany({ where: { bookingId: bookingId! } });
      const updated = await tx.booking.findUnique({ where: { id: bookingId! }, include: { field: true } });
      if (!updated) throw new Error("Booking disappeared during customer cancellation.");
      return updated;
    });

    const notification = await notifyAdmin(cancelledBooking, "CUSTOMER CANCELLED UNPAID BOOKING");
    return NextResponse.json({ booking: cancelledBooking, notification });
  } catch (error) {
    if (error instanceof Error && error.message === "CUSTOMER_CANCELLATION_CONFLICT") {
      return NextResponse.json({ error: "This booking was paid, cancelled, or changed. Refresh and try again." }, { status: 409 });
    }
    console.error("Customer booking request failed:", error);
    return NextResponse.json({ error: "Unable to manage customer bookings." }, { status: 500 });
  }
}
