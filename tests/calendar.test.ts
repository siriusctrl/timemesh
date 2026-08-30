import { describe, expect, it } from "vitest";
import { alignSlotDays } from "../src/calendar/alignDays";
import { createBaseAllocation, groupSlotsByDay } from "../src/protocol/time";

describe("calendar row alignment", () => {
  it("keeps partial cross-zone days aligned to shared wall-clock rows", () => {
    const base = createBaseAllocation({
      startDate: "2026-08-30",
      days: 7,
      timezone: "Asia/Shanghai",
    });
    const { days, rows } = alignSlotDays(groupSlotsByDay(base, "America/Los_Angeles"), base.slotMinutes);

    expect(rows[0].timeLabel).toBe("00:00");
    expect(rows.at(-1)?.timeLabel).toBe("23:45");
    expect(days[0].slots[0]).toBeNull();
    expect(days[1].slots[0]?.timeLabel).toBe("00:00");
    expect(days[0].slots.findIndex((slot) => slot?.timeLabel === "09:00"))
      .toBe(days[1].slots.findIndex((slot) => slot?.timeLabel === "09:00"));
  });

  it("adds explicit repeated-hour rows across a fall DST boundary", () => {
    const base = createBaseAllocation({
      startDate: "2026-10-31",
      days: 3,
      timezone: "America/New_York",
    });
    const { days, rows } = alignSlotDays(groupSlotsByDay(base, base.timezone), base.slotMinutes);
    const repeatedOneOClock = rows.filter((slot) => slot.timeLabel === "01:00");

    expect(repeatedOneOClock).toHaveLength(2);
    expect(days.find((day) => day.key === "2026-11-01")?.slots.filter((slot) => slot?.timeLabel === "01:00"))
      .toHaveLength(2);
  });

  it("keeps both partial days for a one-day cross-zone frame", () => {
    const base = createBaseAllocation({
      startDate: "2026-08-30",
      days: 1,
      timezone: "Asia/Shanghai",
    });
    const { days, rows } = alignSlotDays(
      groupSlotsByDay(base, "America/Los_Angeles"),
      base.slotMinutes,
    );

    expect(rows).toHaveLength(96);
    expect(days).toHaveLength(2);
    expect(days.flatMap((day) => day.slots).filter(Boolean)).toHaveLength(base.slotCount);
    expect(days[0].slots.find((slot) => slot?.timeLabel === "09:00")).toBeDefined();
    expect(days[1].slots.find((slot) => slot?.timeLabel === "08:45")).toBeDefined();
  });

  it("preserves fractional-hour DST rows on an hourly grid", () => {
    const base = createBaseAllocation({
      startDate: "2026-04-04",
      days: 3,
      timezone: "UTC",
      slotMinutes: 60,
    });
    const { days, rows } = alignSlotDays(
      groupSlotsByDay(base, "Australia/Lord_Howe"),
      base.slotMinutes,
    );

    expect(rows.some((row) => row.minute === 0)).toBe(true);
    expect(rows.some((row) => row.minute === 30)).toBe(true);
    expect(days.flatMap((day) => day.slots).filter(Boolean)).toHaveLength(base.slotCount);
  });
});
