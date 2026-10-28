import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notifyAdmin } from "@/lib/notifications";
import { getPaymentTransition, type PaymentAction } from "@/lib/payment";
import { calculateBookingAmountDueCents } from "@/lib/deposit";
import { hasTrustedOrigin, isAdminRequest, unauthorized } from "@/lib/auth";
import { z } from "zod";

const paymentReviewSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("verify"),
    transactionReference: z.string().trim().min(1).max(128),
  }),
  z.object({ action: z.literal("fail") }),
  z.object({ action: z.literal("refund") }),
]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Request origin not allowed." }, { status: 403 });
  if (!(await isAdminRequest(request))) return unauthorized();
  const { id } = await context.params;
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Payment review must be valid JSON." }, { status: 400 });
    }
    const parsed = paymentReviewSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Provide a valid payment action and, when verifying, the bank transaction reference." }, { status: 400 });
    const current = await db.booking.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    const action = parsed.data.action as PaymentAction;
    const transactionReference = parsed.data.action === "verify" ? parsed.data.transactionReference : undefined;
    let transition: ReturnType<typeof getPaymentTransition>;
    try {
      transition = getPaymentTransition(current.paymentStatus, current.status, action);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 409 });
    }
    const isRefund = action === "refund";
    const verified = action === "verify";
    const booking = await db.$transaction(async (tx) => {
      const changed = await tx.booking.updateMany({
        where: { id, paymentStatus: isRefund ? "PAID" : "PENDING", status: current.status },
        data: {
          paymentStatus: transition.paymentStatus,
          status: transition.bookingStatus,
          amountPaidCents: verified ? calculateBookingAmountDueCents(current.totalCents, current.bookingFeeCents) : undefined,
          verifiedAt: verified || isRefund ? new Date() : null,
          verifiedBy: process.env.ADMIN_USERNAME ?? "admin",
          paymentTransactionReference: transactionReference,
        },
      });
      if (changed.count !== 1) throw new Error("PAYMENT_REVIEW_CONFLICT");
      if (transition.releaseSlots) await tx.bookingSlot.deleteMany({ where: { bookingId: id } });
      const updated = await tx.booking.findUnique({ where: { id }, include: { field: true } });
      if (!updated) throw new Error("Booking disappeared during payment review.");
      return updated;
    });
    const notification = await notifyAdmin(
      booking,
      isRefund ? "REFUND RECORDED" : verified ? "PAYMENT VERIFIED — BOOKING CONFIRMED" : "PAYMENT FAILED — BOOKING RELEASED",
    );
    return NextResponse.json({ booking, notification });
  } catch (error) {
    if (error instanceof Error && error.message === "PAYMENT_REVIEW_CONFLICT") {
      return NextResponse.json({ error: "This payment was already reviewed." }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That bank transaction reference has already been used." }, { status: 409 });
    }
    console.error("Payment review failed:", error);
    return NextResponse.json({ error: "Unable to update payment status." }, { status: 500 });
  }
}
