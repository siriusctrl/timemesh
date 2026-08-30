import type { SlotDay, SlotView } from "../protocol/time";

export type AlignedSlotDay = Omit<SlotDay, "slots"> & {
  slots: Array<SlotView | null>;
};

export type CalendarRow = Pick<SlotView, "hour" | "minute" | "timeLabel"> & {
  key: string;
};

function keyedSlots(slots: SlotView[]): Map<string, SlotView> {
  const occurrences = new Map<string, number>();
  return new Map(slots.map((slot) => {
    const occurrence = occurrences.get(slot.timeLabel) ?? 0;
    occurrences.set(slot.timeLabel, occurrence + 1);
    return [`${slot.timeLabel}:${occurrence}`, slot];
  }));
}

function timeLabel(minuteOfDay: number): string {
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
}

export function alignSlotDays(
  days: SlotDay[],
  slotMinutes: number,
): { days: AlignedSlotDay[]; rows: CalendarRow[] } {
  if (days.length === 0) return { days: [], rows: [] };

  const dayMaps = days.map((day) => keyedSlots(day.slots));
  const observedMinutes = days.flatMap((day) => day.slots.map((slot) => slot.hour * 60 + slot.minute));
  const firstMinute = Math.min(...observedMinutes);
  const lastMinute = Math.max(...observedMinutes);
  const rowMinutes = new Set(observedMinutes);
  for (
    let minute = Math.ceil(firstMinute / slotMinutes) * slotMinutes;
    minute <= lastMinute;
    minute += slotMinutes
  ) {
    rowMinutes.add(minute);
  }
  const labels = [...rowMinutes].sort((left, right) => left - right).map(timeLabel);
  const maxOccurrences = new Map(labels.map((label) => [
    label,
    Math.max(1, ...dayMaps.map((slots) => [...slots.keys()].filter((key) => key.startsWith(`${label}:`)).length)),
  ]));
  const rowKeys: string[] = [];
  let repeatedGroup: string[] = [];

  const appendRepeatedRows = () => {
    const groupMax = Math.max(1, ...repeatedGroup.map((label) => maxOccurrences.get(label) ?? 1));
    for (let occurrence = 1; occurrence < groupMax; occurrence += 1) {
      for (const label of repeatedGroup) {
        if ((maxOccurrences.get(label) ?? 1) > occurrence) rowKeys.push(`${label}:${occurrence}`);
      }
    }
    repeatedGroup = [];
  };

  labels.forEach((label, index) => {
    rowKeys.push(`${label}:0`);
    if ((maxOccurrences.get(label) ?? 1) > 1) repeatedGroup.push(label);
    const nextLabel = labels[index + 1];
    if (repeatedGroup.length > 0 && (!nextLabel || (maxOccurrences.get(nextLabel) ?? 1) === 1)) {
      appendRepeatedRows();
    }
  });

  return {
    rows: rowKeys.map((key) => {
      const label = key.slice(0, key.lastIndexOf(":"));
      const [hour, minute] = label.split(":").map(Number);
      return { key, timeLabel: label, hour, minute };
    }),
    days: days.map((day, index) => ({
      ...day,
      slots: rowKeys.map((key) => dayMaps[index].get(key) ?? null),
    })),
  };
}
