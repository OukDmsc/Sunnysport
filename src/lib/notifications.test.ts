import type { Booking, Field } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bookingReference, formatNewBookingNotification, notifyAdmin, notifyNewBooking } from "./notifications";

const booking: Booking & { field: Field } = {
  id: "booking-1",
  reference: "FB20261026ABC123",
  customerName: "Dara Sok",
  phone: "+855 12 345 678",
  notes: "",
  date: "2026-10-27",
  startTime: "18:00",
  duration: 2,
  endTime: "20:00",
  totalCents: 2622,
  bookingFeeCents: 122,
  amountPaidCents: 0,
  status: "PENDING",
  paymentStatus: "PENDING",
  paymentMethod: "MANUAL_KHQR",
  verifiedAt: null,
  verifiedBy: null,
  paymentTransactionReference: null,
  createdAt: new Date("2026-10-26T00:00:00.000Z"),
  updatedAt: new Date("2026-10-26T00:00:00.000Z"),
  fieldId: "field-1",
  customerAccountId: null,
  field: {
    id: "field-1",
    name: "Pitch A",
    surface: "Artificial turf",
    hourlyRateCents: 2500,
    description: "7-a-side",
    active: true,
    createdAt: new Date("2026-10-26T00:00:00.000Z"),
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Telegram notifications", () => {
  it("reports disabled configuration without attempting a network call", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
    vi.stubEnv("TELEGRAM_GROUP_CHAT_ID", "");
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(notifyAdmin(booking, "NEW FOOTBALL FIELD BOOKING")).resolves.toEqual({
      delivered: false,
      reason: "Telegram is not configured.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the booking details through the configured Telegram Bot API", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_GROUP_CHAT_ID", "-1001234567890");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await expect(notifyNewBooking(booking)).resolves.toEqual({ delivered: true });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bottest-token/sendMessage");
    const message = JSON.parse(String(request?.body));
    expect(message.chat_id).toBe("-1001234567890");
    expect(message.text).toBe(formatNewBookingNotification(booking));
    expect(message.text).toContain("🔔 NEW BOOKING");
    expect(message.text).toContain("🏟️ Field: Pitch A");
    expect(message.text).toContain("⏰ Time: 6:00 PM - 8:00 PM");
    expect(message.text).toContain("👤 Customer: Dara Sok");
    expect(message.text).toContain("💰 Total: $26.22");
    expect(message.text).toContain("💳 Deposit: $2.63");
    expect(message.text).toContain("💵 Remaining: $23.59");
    expect(message.text).toContain("🆔 Booking ID: #FB20261026ABC123");
    expect(message.text).toContain("💳 Payment: PENDING");
  });

  it("reports transport errors without logging potentially sensitive request details", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_GROUP_CHAT_ID", "-1001234567890");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-1000000000000");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("request failed"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(notifyNewBooking(booking)).resolves.toEqual({
      delivered: false,
      reason: "Telegram could not be reached.",
    });
    expect(consoleError).toHaveBeenCalledWith("Telegram notification could not be delivered.");
  });

  it("supports the previously configured chat ID when the group chat ID is empty", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_GROUP_CHAT_ID", "");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-1001234567890");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await expect(notifyNewBooking(booking)).resolves.toEqual({ delivered: true });
    const request = fetch.mock.calls[0][1];
    expect(JSON.parse(String(request?.body)).chat_id).toBe("-1001234567890");
  });

  it("reports a Bot API rejection even when Telegram responds with HTTP 200", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_GROUP_CHAT_ID", "-1001234567890");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"ok":false,"description":"chat not found"}', { status: 200 }));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(notifyAdmin(booking, "NEW FOOTBALL FIELD BOOKING")).resolves.toEqual({
      delivered: false,
      reason: "Telegram rejected the notification.",
    });
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it("creates reference numbers using the expected prefix", () => {
    expect(bookingReference()).toMatch(/^FB\d{8}[A-F0-9]{6}$/);
  });
});
