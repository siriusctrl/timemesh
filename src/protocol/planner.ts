import { getBit } from "./bits";
import type { BaseAllocation, ParticipantAllocation } from "./types";

export type CandidateWindow = {
  startSlot: number;
  endSlot: number;
  attendeeCount: number;
  participantCount: number;
  participantIndexes: number[];
  preferredSlotCount: number;
};

export type CandidateWindowOptions = {
  limit?: number;
  minimumAttendees?: number;
  allowedSlots?: ReadonlySet<number>;
  preferredSlots?: ReadonlySet<number>;
  diversifyDays?: boolean;
};

export function availabilityScores(
  base: BaseAllocation,
  participants: ParticipantAllocation[],
): number[] {
  return Array.from({ length: base.slotCount }, (_, index) => {
    if (getBit(base.unavailable, index)) return -1;
    return participants.reduce(
      (count, participant) => count + (getBit(participant.free, index) ? 1 : 0),
      0,
    );
  });
}

export function findCandidateWindows(
  base: BaseAllocation,
  participants: ParticipantAllocation[],
  optionsOrLimit: CandidateWindowOptions | number = {},
): CandidateWindow[] {
  const options = typeof optionsOrLimit === "number"
    ? { limit: optionsOrLimit }
    : optionsOrLimit;
  const limit = options.limit ?? 12;
  const minimumAttendees = options.minimumAttendees ?? 0;
  const durationSlots = base.meetingMinutes / base.slotMinutes;
  const candidates: CandidateWindow[] = [];
  for (let startSlot = 0; startSlot <= base.slotCount - durationSlots; startSlot += 1) {
    const endSlot = startSlot + durationSlots;
    let hostAvailable = true;
    for (let index = startSlot; index < endSlot; index += 1) {
      if (getBit(base.unavailable, index) || (options.allowedSlots && !options.allowedSlots.has(index))) {
        hostAvailable = false;
        break;
      }
    }
    if (!hostAvailable) continue;
    const participantIndexes = participants.reduce<number[]>((indexes, participant, participantIndex) => {
      for (let index = startSlot; index < endSlot; index += 1) {
        if (!getBit(participant.free, index)) return indexes;
      }
      indexes.push(participantIndex);
      return indexes;
    }, []);
    const attendeeCount = participantIndexes.length;
    if (attendeeCount < minimumAttendees) continue;
    let preferredSlotCount = 0;
    for (let index = startSlot; index < endSlot; index += 1) {
      if (options.preferredSlots?.has(index)) preferredSlotCount += 1;
    }
    candidates.push({
      startSlot,
      endSlot,
      attendeeCount,
      participantCount: participants.length,
      participantIndexes,
      preferredSlotCount,
    });
  }
  const sorted = candidates.sort(
    (left, right) =>
      right.attendeeCount - left.attendeeCount ||
      right.preferredSlotCount - left.preferredSlotCount ||
      left.startSlot - right.startSlot,
  );
  if (options.diversifyDays === false) return sorted.slice(0, limit);
  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: base.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayKey = (candidate: CandidateWindow) => dayFormatter.format(
    new Date((base.startEpochMinutes + candidate.startSlot * base.slotMinutes) * 60_000),
  );
  const ranked: CandidateWindow[] = [];
  const seenDays = new Set<string>();
  const attendanceLevels = [...new Set(sorted.map((candidate) => candidate.attendeeCount))];
  for (const attendance of attendanceLevels) {
    const group = sorted.filter((candidate) => candidate.attendeeCount === attendance);
    for (const candidate of group) {
      const key = dayKey(candidate);
      if (seenDays.has(key)) continue;
      ranked.push(candidate);
      seenDays.add(key);
      if (ranked.length === limit) return ranked;
    }
    for (const candidate of group) {
      if (ranked.includes(candidate)) continue;
      ranked.push(candidate);
      if (ranked.length === limit) return ranked;
    }
  }
  return ranked;
}
