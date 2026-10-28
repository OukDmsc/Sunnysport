export function formatTime(time: string, language: "en" | "km" = "en") {
  const match = /^(2[0-3]|[01]\d|24):([0-5]\d)$/.exec(time);
  if (!match || (match[1] === "24" && match[2] !== "00")) {
    throw new Error(`Invalid time: ${time}`);
  }

  const hour = Number(match[1]) % 24;
  const minute = Number(match[2]);
  const locale = language === "km" ? "km-KH" : "en-US";
  const hourFormat = new Intl.NumberFormat(locale, {
    useGrouping: false,
  });
  const minuteFormat = new Intl.NumberFormat(locale, {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });

  return `${hourFormat.format(hour % 12 || 12)}:${minuteFormat.format(minute)} ${hour < 12 ? "AM" : "PM"}`;
}

export function formatTimeRange(range: string, language: "en" | "km" = "en") {
  const [start, end] = range.split("-");
  if (!start || !end) throw new Error(`Invalid time range: ${range}`);
  return `${formatTime(start, language)}–${formatTime(end, language)}`;
}
