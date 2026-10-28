import { z } from "zod";

export const bookingInputSchema = z.object({
  fieldId: z.string().min(1).max(40),
  customerName: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[+0-9 ()-]{7,24}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
  duration: z.literal(2),
  notes: z.string().trim().max(500).optional().default(""),
});

export const fieldInputSchema = z.object({
  name: z.string().trim().min(2).max(50),
  surface: z.string().trim().min(2).max(80),
  hourlyRateCents: z.number().int().min(0).max(10000000),
  description: z.string().trim().max(250).default(""),
  active: z.boolean().default(true),
});

export function isValidBookingDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) return false;

  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Phnom_Penh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const today = Object.fromEntries(todayParts.map((part) => [part.type, part.value]));
  const cambodiaToday = `${today.year}-${today.month}-${today.day}`;
  return value >= cambodiaToday;
}

export function isValidOpeningHours(value: string) {
  const match = /^(2[0-3]|[01]\d):00-(24|2[0-3]|[01]\d):00$/.exec(value);
  return Boolean(match && Number(match[2]) > Number(match[1]));
}
