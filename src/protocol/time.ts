import { Temporal } from "@js-temporal/polyfill";
import { createBitset } from "./bits";
import {
  DEFAULT_SLOT_MINUTES,
  MAX_WINDOW_DAYS,
  PROTOCOL_VERSION,
  type BaseAllocation,
  type SlotMinutes,
  type TimeRange,
} from "./types";

export type SlotView = {
  index: number;
  epochMinutes: number;
  dayKey: string;
  dateLabel: string;
  weekdayLabel: string;
  timeLabel: string;
  hour: number;
  minute: number;
  offset: string;
};

export type SlotDay = {
  key: string;
  dateLabel: string;
  weekdayLabel: string;
  slots: SlotView[];
};

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function todayInTimeZone(timeZone: string): string {
  return Temporal.Now.instant().toZonedDateTimeISO(timeZone).toPlainDate().toString();
}

export function baseStartDate(base: BaseAllocation): string {
  return slotInstant(base, 0).toZonedDateTimeISO(base.timezone).toPlainDate().toString();
}

export function baseWindowDays(base: BaseAllocation): number {
  const start = slotInstant(base, 0).toZonedDateTimeISO(base.timezone).toPlainDate();
  const end = Temporal.Instant.fromEpochMilliseconds(
    (base.startEpochMinutes + base.slotCount * base.slotMinutes) * 60_000,
  ).toZonedDateTimeISO(base.timezone).toPlainDate();
  return start.until(end, { largestUnit: "day" }).days;
}

export function createBaseAllocation(options: {
  startDate: string;
  days: number;
  timezone: string;
  slotMinutes?: SlotMinutes;
  meetingMinutes?: number;
  unavailableSlots?: Iterable<number>;
}): BaseAllocation {
  const slotMinutes = options.slotMinutes ?? DEFAULT_SLOT_MINUTES;
  if (!Number.isInteger(options.days) || options.days < 1 || options.days > MAX_WINDOW_DAYS) {
    throw new RangeError(`Window days must be between 1 and ${MAX_WINDOW_DAYS}.`);
  }
  const date = Temporal.PlainDate.from(options.startDate);
  const start = Temporal.ZonedDateTime.from({
    timeZone: options.timezone,
    year: date.year,
    month: date.month,
    day: date.day,
    hour: 0,
    minute: 0,
  });
  const end = start.add({ days: options.days });
  const elapsedMinutes = (end.epochMilliseconds - start.epochMilliseconds) / 60_000;
  if (!Number.isInteger(elapsedMinutes / slotMinutes)) {
    throw new RangeError("The selected time-zone boundary does not align to the slot size.");
  }
  const slotCount = elapsedMinutes / slotMinutes;
  return {
    version: PROTOCOL_VERSION,
    kind: "base",
    slotMinutes,
    meetingMinutes: options.meetingMinutes ?? 60,
    startEpochMinutes: Math.floor(start.epochMilliseconds / 60_000),
    slotCount,
    timezone: options.timezone,
    unavailable: createBitset(slotCount, options.unavailableSlots),
  };
}

export function slotEpochMinutes(base: BaseAllocation, index: number): number {
  return base.startEpochMinutes + index * base.slotMinutes;
}

export function slotInstant(base: BaseAllocation, index: number): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(slotEpochMinutes(base, index) * 60_000);
}

export function formatInstant(
  epochMinutes: number,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en", { timeZone, ...options }).format(
    new Date(epochMinutes * 60_000),
  );
}

export function describeBaseRange(base: BaseAllocation, timeZone = base.timezone): string {
  const start = base.startEpochMinutes;
  const end = start + base.slotCount * base.slotMinutes;
  const format = (epochMinutes: number) => formatInstant(epochMinutes, timeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${format(start)} to ${format(end - 1)}`;
}

export function groupSlotsByDay(base: BaseAllocation, timeZone: string): SlotDay[] {
  const days = new Map<string, SlotDay>();
  for (let index = 0; index < base.slotCount; index += 1) {
    const zoned = slotInstant(base, index).toZonedDateTimeISO(timeZone);
    const dayKey = zoned.toPlainDate().toString();
    let day = days.get(dayKey);
    if (!day) {
      day = {
        key: dayKey,
        dateLabel: formatInstant(slotEpochMinutes(base, index), timeZone, {
          month: "short",
          day: "numeric",
        }),
        weekdayLabel: formatInstant(slotEpochMinutes(base, index), timeZone, {
          weekday: "short",
        }),
        slots: [],
      };
      days.set(dayKey, day);
    }
    day.slots.push({
      index,
      epochMinutes: slotEpochMinutes(base, index),
      dayKey,
      dateLabel: day.dateLabel,
      weekdayLabel: day.weekdayLabel,
      timeLabel: `${String(zoned.hour).padStart(2, "0")}:${String(zoned.minute).padStart(2, "0")}`,
      hour: zoned.hour,
      minute: zoned.minute,
      offset: zoned.offset,
    });
  }
  return [...days.values()];
}

function rangeEpochMilliseconds(value: string): number {
  try {
    return Temporal.ZonedDateTime.from(value).epochMilliseconds;
  } catch {
    try {
      return Temporal.Instant.from(value).epochMilliseconds;
    } catch {
      throw new RangeError(
        `Range boundary ${value} needs an offset or bracketed IANA time zone.`,
      );
    }
  }
}

export function rangesToSlotSet(
  base: BaseAllocation,
  ranges: TimeRange[],
  behavior: "free" | "unavailable",
): Set<number> {
  const normalized = ranges.map((range) => {
    const start = rangeEpochMilliseconds(range.start);
    const end = rangeEpochMilliseconds(range.end);
    if (end <= start) throw new RangeError(`Range end must follow its start: ${range.start}`);
    return { start, end };
  });
  const result = new Set<number>();
  for (let index = 0; index < base.slotCount; index += 1) {
    const start = slotEpochMinutes(base, index) * 60_000;
    const end = start + base.slotMinutes * 60_000;
    const selected = normalized.some((range) =>
      behavior === "free"
        ? start >= range.start && end <= range.end
        : start < range.end && end > range.start,
    );
    if (selected) result.add(index);
  }
  return result;
}

export function workHoursSlotSet(
  base: BaseAllocation,
  timeZone: string,
  startHour: number,
  endHour: number,
  weekdaysOnly = true,
): Set<number> {
  const result = new Set<number>();
  for (let index = 0; index < base.slotCount; index += 1) {
    const zoned = slotInstant(base, index).toZonedDateTimeISO(timeZone);
    const withinHours = zoned.hour >= startHour && zoned.hour < endHour;
    const withinDays = !weekdaysOnly || zoned.dayOfWeek <= 5;
    if (withinHours && withinDays) result.add(index);
  }
  return result;
}
