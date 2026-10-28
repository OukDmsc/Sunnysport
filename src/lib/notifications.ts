import type { Booking, Field } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { formatTime } from "./time";
import { calculateBookingAmountDueCents } from "./deposit";

type BookingWithField = Booking & { field: Field };

export function normalizeTelegramChatId(rawValue: string) {
  const value = rawValue.trim();
  if (!value) return value;

  if (/^https?:\/\//i.test(value)) {
    const match = value.match(/https?:\/\/t\.me\/(?:\+)?([^/?#]+)/i);
    if (match) {
      const publicHandle = match[1].replace(/^\+/, "").replace(/^@/, "");
      return publicHandle ? `@${publicHandle}` : value;
    }
  }

  const normalized = value.replace(/^\+/, "").replace(/^@/, "");
  return /^-?\d+$/.test(normalized) ? normalized : `@${normalized}`;
}

export async function sendTelegramMessage(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = normalizeTelegramChatId(process.env.TELEGRAM_CHAT_ID ?? "");
  if (!token || !chatId) return { delivered: false, reason: "Telegram is not configured." };

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      console.error("Telegram notification failed:", response.status, await response.text());
      return { delivered: false, reason: "Telegram rejected the notification." };
    }
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
      console.error("Telegram notification was not accepted by the Bot API:", result);
      return { delivered: false, reason: "Telegram rejected the notification." };
    }
    return { delivered: true };
  } catch (error) {
    console.error("Telegram notification could not be delivered:", error);
    return { delivered: false, reason: "Telegram could not be reached." };
  }
}

export async function notifyAdmin(booking: BookingWithField, event: string) {
  const amountDue = booking.paymentStatus === "PAID"
    ? booking.amountPaidCents
    : calculateBookingAmountDueCents(booking.totalCents, booking.bookingFeeCents);
  const rentalCents = booking.totalCents - booking.bookingFeeCents;
  const adjustmentLine = booking.bookingFeeCents < 0
    ? `Booking discount: $${(Math.abs(booking.bookingFeeCents) / 100).toFixed(2)}`
    : booking.bookingFeeCents > 0
      ? `Legacy booking fee: $${(booking.bookingFeeCents / 100).toFixed(2)}`
      : null;
  const text = [
    `⚽ ${event}`,
    `Booking ID: #${booking.reference}`,
    `Customer: ${booking.customerName}`,
    `Phone: ${booking.phone}`,
    `Field: ${booking.field.name}`,
    `Date: ${booking.date}`,
    `Time: ${formatTime(booking.startTime)} - ${formatTime(booking.endTime)}`,
    `Court rental: $${(rentalCents / 100).toFixed(2)}`,
    ...(adjustmentLine ? [adjustmentLine] : []),
    `Total: $${(booking.totalCents / 100).toFixed(2)}`,
    `Amount due/received: $${(amountDue / 100).toFixed(2)}`,
    `Payment: ${booking.paymentStatus}`,
  ].join("\n");

  return sendTelegramMessage(text);
}

export function bookingReference() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `FB${value.year}${value.month}${value.day}${randomUUID().slice(0, 6).toUpperCase()}`;
}
