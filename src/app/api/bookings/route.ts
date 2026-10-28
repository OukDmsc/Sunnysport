import { Prisma } from "@prisma/client";
import QRCode from "qrcode";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookingReference, notifyAdmin } from "@/lib/notifications";
import {
  BOOKING_DISCOUNT_CENTS,
  calculateFinalBookingTotalCents,
  calculateTotalCents,
  getBookingTimes,
} from "@/lib/booking";
import { bookingInputSchema, isValidBookingDate } from "@/lib/validation";
import { createCustomerBookingAccessToken, hashCustomerBookingAccessToken } from "@/lib/customer-booking-access";
import { hasTrustedOrigin, isAdminRequest, unauthorized } from "@/lib/auth";
import { getCustomerAccountFromRequest } from "@/lib/customer-auth";
import { createBookingKhqr, KhqrConfigurationError } from "@/lib/khqr";

export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) return unauthorized();
  const date = request.nextUrl.searchParams.get("date");
  const bookings = await db.booking.findMany({
    where: date ? { date } : {},
    include: { field: true },
    orderBy: [{ date: "desc" }, { startTime: "asc" }],
    take: 500,
  });
  return NextResponse.json(bookings);
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  try {
    const admin = await isAdminRequest(request);
    const customer = admin ? null : await getCustomerAccountFromRequest(request);
    if (!admin && !customer) {
      return NextResponse.json({ error: "Sign in to a customer account before booking.", errorCode: "CUSTOMER_SIGN_IN_REQUIRED" }, { status: 401 });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Booking request must be valid JSON." }, { status: 400 });
    }
    const parsed = bookingInputSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Please check the booking details and try again.", errorCode: "INVALID_BOOKING_DETAILS" }, { status: 400 });
    const input = parsed.data;
    if (!isValidBookingDate(input.date)) {
      return NextResponse.json({ error: "Choose a valid date that is not in the past.", errorCode: "INVALID_BOOKING_DATE" }, { status: 400 });
    }
    if (new Date(`${input.date}T${input.startTime}:00+07:00`).getTime() <= Date.now()) {
      return NextResponse.json({ error: "Choose a start time in the future.", errorCode: "BOOKING_TIME_PASSED" }, { status: 400 });
    }
    const field = await db.field.findFirst({ where: { id: input.fieldId, active: true } });
    if (!field) return NextResponse.json({ error: "That field is unavailable.", errorCode: "FIELD_NOT_AVAILABLE" }, { status: 404 });
    const rateSetting = await db.setting.findUnique({ where: { key: "usdToKhrRate" } });
    const { slots, endTime } = getBookingTimes(input.startTime, input.duration);
    const usdToKhrRate = Number(rateSetting?.value ?? process.env.USD_TO_KHR_RATE ?? "4100");
    const rentalCents = calculateTotalCents(field.hourlyRateCents, input.duration);
    const bookingFeeCents = -BOOKING_DISCOUNT_CENTS;
    const totalCents = calculateFinalBookingTotalCents(rentalCents);
    const customerAccessToken = createCustomerBookingAccessToken();
    const reference = bookingReference();
    const dynamicKhqr = await createBookingKhqr({ reference, amountCents: totalCents, usdToKhrRate });
    const legacyPaymentUrl = dynamicKhqr ? null : process.env.KHQR_PAYMENT_URL || null;
    let paymentQrDataUrl: string | null = dynamicKhqr?.dataUrl ?? null;
    if (!dynamicKhqr && legacyPaymentUrl) {
      try {
        paymentQrDataUrl = await QRCode.toDataURL(legacyPaymentUrl, { errorCorrectionLevel: "M", margin: 1, width: 300 });
      } catch (error) {
        console.error("PayWay payment QR generation failed:", error);
        return NextResponse.json({ error: "Unable to prepare the KHQR payment link. Please try again." }, { status: 500 });
      }
    }
    const booking = await db.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          reference,
          customerName: customer?.name ?? input.customerName,
          phone: customer?.phone ?? input.phone,
          notes: input.notes,
          date: input.date,
          startTime: input.startTime,
          duration: input.duration,
          endTime,
          totalCents,
          bookingFeeCents,
          fieldId: field.id,
          customerAccountId: customer?.id,
          slots: { create: slots.map((time) => ({ fieldId: field.id, date: input.date, time })) },
          customerAccess: { create: { tokenHash: hashCustomerBookingAccessToken(customerAccessToken) } },
        },
        include: { field: true },
      });
      return created;
    });
    const notification = await notifyAdmin(booking, "NEW FOOTBALL FIELD BOOKING");
    return NextResponse.json({
      booking,
      customerAccessToken,
      payment: {
        mode: "MANUAL_KHQR",
        qrImageUrl: dynamicKhqr ? null : process.env.KHQR_IMAGE_URL || null,
        paymentUrl: legacyPaymentUrl,
        paymentQrDataUrl,
        amountPrefilled: Boolean(dynamicKhqr),
        khqrCurrency: dynamicKhqr?.currency ?? null,
        khqrAmount: dynamicKhqr?.amount ?? null,
        qrExpiresAt: dynamicKhqr?.expiresAt ?? null,
        amountCents: totalCents,
        bookingDiscountCents: BOOKING_DISCOUNT_CENTS,
        bookingFeeCents: booking.bookingFeeCents,
        instructions: dynamicKhqr
          ? "The full booking total, after the $2.50 discount, is encoded in this KHQR."
          : process.env.KHQR_PAYMENT_INSTRUCTIONS ?? "Pay the full booking total after the $2.50 discount using KHQR. Include your booking reference.",
      },
      notification,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof KhqrConfigurationError) {
      return NextResponse.json({
        error: "Dynamic KHQR settings are incomplete. Contact the club before creating this booking.",
        errorCode: "KHQR_CONFIGURATION_INCOMPLETE",
      }, { status: 503 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That time was just booked. Please select another slot.", errorCode: "BOOKING_SLOT_CONFLICT" }, { status: 409 });
    }
    if (error instanceof Error && /Court rental must/.test(error.message)) {
      return NextResponse.json({ error: error.message, errorCode: "INVALID_BOOKING_PRICE" }, { status: 400 });
    }
    if (error instanceof Error && /Bookings must|Choose a valid/.test(error.message)) {
      return NextResponse.json({ error: error.message, errorCode: "INVALID_BOOKING_TIME" }, { status: 400 });
    }
    console.error("Booking creation failed:", error);
    return NextResponse.json({ error: "Unable to create booking. Please contact the club with this error code.", errorCode: "BOOKING_CREATE_FAILED" }, { status: 500 });
  }
}
