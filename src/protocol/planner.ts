import { getBit } from "./bits";
import type { BaseAllocation, ParticipantAllocation } from "./types";

export type CandidateWindow = {
  startSlot: number;
  endSlot: number;
  attendeeCount: number;
  participantCount: number;
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
  limit = 12,
): CandidateWindow[] {
  const durationSlots = base.meetingMinutes / base.slotMinutes;
  const candidates: CandidateWindow[] = [];
  for (let startSlot = 0; startSlot <= base.slotCount - durationSlots; startSlot += 1) {
    const endSlot = startSlot + durationSlots;
    let hostAvailable = true;
    for (let index = startSlot; index < endSlot; index += 1) {
      if (getBit(base.unavailable, index)) {
        hostAvailable = false;
        break;
      }
    }
    if (!hostAvailable) continue;
    const attendeeCount = participants.reduce((count, participant) => {
      for (let index = startSlot; index < endSlot; index += 1) {
        if (!getBit(participant.free, index)) return count;
      }
      return count + 1;
    }, 0);
    candidates.push({
      startSlot,
      endSlot,
      attendeeCount,
      participantCount: participants.length,
    });
  }
  const sorted = candidates.sort(
    (left, right) => right.attendeeCount - left.attendeeCount || left.startSlot - right.startSlot,
  );
  const dayKey = (candidate: CandidateWindow) => new Intl.DateTimeFormat("en-CA", {
    timeZone: base.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date((base.startEpochMinutes + candidate.startSlot * base.slotMinutes) * 60_000));
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
