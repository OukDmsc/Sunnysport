import { describe, expect, it } from "vitest";
import { formatTime, formatTimeRange } from "./time";

describe("time formatting", () => {
  it.each([
    ["00:00", "12:00 AM"],
    ["06:30", "6:30 AM"],
    ["12:00", "12:00 PM"],
    ["18:30", "6:30 PM"],
    ["24:00", "12:00 AM"],
  ])("formats %s in 12-hour time", (time, expected) => {
    expect(formatTime(time)).toBe(expected);
  });

  it("formats opening hours as an AM/PM range", () => {
    expect(formatTimeRange("06:00-24:00")).toBe("6:00 AM–12:00 AM");
  });

  it("rejects invalid time values", () => {
    expect(() => formatTime("25:00")).toThrow("Invalid time");
    expect(() => formatTime("24:30")).toThrow("Invalid time");
  });
});
