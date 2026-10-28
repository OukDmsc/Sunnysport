import { describe, expect, it } from "vitest";
import { bookingInputSchema, fieldInputSchema, isValidBookingDate } from "./validation";

function dateOffset(days: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const today = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(`${today.year}-${today.month}-${today.day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

describe("booking date validation", () => {
  it("accepts only exactly two-hour reservations", () => {
    const booking = {
      fieldId: "field-1",
      customerName: "Dara Sok",
      phone: "+85512345678",
      date: "2026-10-28",
      startTime: "18:00",
      notes: "",
    };

    expect(bookingInputSchema.safeParse({ ...booking, duration: 2 }).success).toBe(true);
    expect(bookingInputSchema.safeParse({ ...booking, duration: 1 }).success).toBe(false);
    expect(bookingInputSchema.safeParse({ ...booking, duration: 3 }).success).toBe(false);
  });

  it("accepts today and future calendar dates", () => {
    expect(isValidBookingDate(dateOffset(0))).toBe(true);
    expect(isValidBookingDate(dateOffset(1))).toBe(true);
  });

  describe("field pricing validation", () => {
    it("accepts hourly rates stored in cents", () => {
      expect(fieldInputSchema.parse({
        name: "Pitch D",
        surface: "Artificial turf",
        hourlyRateCents: 2050,
        description: "",
        active: true,
      }).hourlyRateCents).toBe(2050);
    });

    it("rejects fractional-cent and out-of-range rates", () => {
      const field = { name: "Pitch D", surface: "Artificial turf", description: "", active: true };
      expect(fieldInputSchema.safeParse({ ...field, hourlyRateCents: 2050.5 }).success).toBe(false);
      expect(fieldInputSchema.safeParse({ ...field, hourlyRateCents: 10000001 }).success).toBe(false);
    });
  });

  it("rejects past and impossible calendar dates", () => {
    expect(isValidBookingDate(dateOffset(-1))).toBe(false);
    expect(isValidBookingDate("2026-02-30")).toBe(false);
    expect(isValidBookingDate("not-a-date")).toBe(false);
  });
});
