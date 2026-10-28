export const SLOT_MINUTES = 30;
export const PLAYING_HOURS = "07:00-20:00";
export const BOOKING_DURATION_HOURS = 2;
export const BOOKING_DISCOUNT_CENTS = 250;

export function getBookingTimes(startTime: string, duration: number) {
  const match = /^([01]\d|2[0-3]):(00|30)$/.exec(startTime);
  if (!match || duration !== BOOKING_DURATION_HOURS) {
    throw new Error("Bookings must be exactly 2 hours.");
  }
  const openingMatch = /^(2[0-3]|[01]\d):00-(24|2[0-3]|[01]\d):00$/.exec(PLAYING_HOURS);
  if (!openingMatch) throw new Error("The configured opening hours are invalid.");
  const opening = Number(openingMatch[1]) * 60;
  const closing = Number(openingMatch[2]) * 60;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = start + duration * 60;
  if (start < opening || end > closing || closing <= opening) {
    throw new Error(`Bookings must be within opening hours (${PLAYING_HOURS.replace("-", " to ")}).`);
  }
  const slots: string[] = [];
  for (let minute = start; minute < end; minute += SLOT_MINUTES) {
    slots.push(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
  }
  return {
    slots,
    endTime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
  };
}

export function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && startB < endA;
}

export function calculateTotalCents(hourlyRateCents: number, duration: number) {
  if (!Number.isInteger(hourlyRateCents) || hourlyRateCents < 0 || !Number.isInteger(duration) || duration < 1) {
    throw new Error("Invalid price or duration.");
  }
  return hourlyRateCents * duration;
}

export function calculateFinalBookingTotalCents(rentalCents: number) {
  if (!Number.isSafeInteger(rentalCents) || rentalCents <= BOOKING_DISCOUNT_CENTS) {
    throw new Error("Court rental must be more than the $2.50 booking discount.");
  }
  return rentalCents - BOOKING_DISCOUNT_CENTS;
}
