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

export type IndividualMeetingAssignment = {
  participantIndex: number;
  startSlot: number;
  endSlot: number;
  individualRank: number;
  preferredSlotCount: number;
};

export type IndividualAllocation = {
  assignments: IndividualMeetingAssignment[];
  unassignedParticipantIndexes: number[];
  candidateCounts: number[];
  meetingsAssigned: number;
  preferredSlotCount: number;
  individualRankTotal: number;
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

export function allocateIndividualMeetings(
  base: BaseAllocation,
  participants: ParticipantAllocation[],
  options: Pick<CandidateWindowOptions, "allowedSlots" | "preferredSlots"> = {},
): IndividualAllocation {
  const durationSlots = base.meetingMinutes / base.slotMinutes;
  const candidatesByParticipant = participants.map((participant, participantIndex) =>
    findCandidateWindows(base, [participant], {
      ...options,
      diversifyDays: false,
      limit: base.slotCount,
      minimumAttendees: 1,
    }).map((candidate, index) => ({
      participantIndex,
      startSlot: candidate.startSlot,
      endSlot: candidate.endSlot,
      individualRank: index + 1,
      preferredSlotCount: candidate.preferredSlotCount,
    }))
  );
  const participantOrder = participants.map((_, participantIndex) => participantIndex).sort(
    (left, right) => candidatesByParticipant[left].length - candidatesByParticipant[right].length || left - right,
  );
  const currentAssignments: Array<IndividualMeetingAssignment | undefined> = Array(participants.length);
  const occupiedStarts: number[] = [];
  let best: IndividualAllocation | null = null;

  const overlaps = (candidate: IndividualMeetingAssignment) => occupiedStarts.some((startSlot) =>
    candidate.startSlot < startSlot + durationSlots && candidate.endSlot > startSlot
  );
  const snapshot = (preferredSlotCount: number, individualRankTotal: number): IndividualAllocation => {
    const assignments = currentAssignments.filter((assignment): assignment is IndividualMeetingAssignment =>
      assignment !== undefined
    ).sort((left, right) => left.participantIndex - right.participantIndex);
    const assigned = new Set(assignments.map((assignment) => assignment.participantIndex));
    return {
      assignments,
      unassignedParticipantIndexes: participants
        .map((_, participantIndex) => participantIndex)
        .filter((participantIndex) => !assigned.has(participantIndex)),
      candidateCounts: candidatesByParticipant.map((candidates) => candidates.length),
      meetingsAssigned: assignments.length,
      preferredSlotCount,
      individualRankTotal,
    };
  };
  const isBetter = (candidate: IndividualAllocation, incumbent: IndividualAllocation | null): boolean => {
    if (!incumbent) return true;
    if (candidate.meetingsAssigned !== incumbent.meetingsAssigned) {
      return candidate.meetingsAssigned > incumbent.meetingsAssigned;
    }
    if (candidate.preferredSlotCount !== incumbent.preferredSlotCount) {
      return candidate.preferredSlotCount > incumbent.preferredSlotCount;
    }
    if (candidate.individualRankTotal !== incumbent.individualRankTotal) {
      return candidate.individualRankTotal < incumbent.individualRankTotal;
    }
    for (let participantIndex = 0; participantIndex < participants.length; participantIndex += 1) {
      const candidateStart = candidate.assignments.find((assignment) =>
        assignment.participantIndex === participantIndex
      )?.startSlot ?? Number.POSITIVE_INFINITY;
      const incumbentStart = incumbent.assignments.find((assignment) =>
        assignment.participantIndex === participantIndex
      )?.startSlot ?? Number.POSITIVE_INFINITY;
      if (candidateStart !== incumbentStart) return candidateStart < incumbentStart;
    }
    return false;
  };

  const visit = (
    orderIndex: number,
    preferredSlotCount: number,
    individualRankTotal: number,
  ) => {
    if (orderIndex === participantOrder.length) {
      const candidate = snapshot(preferredSlotCount, individualRankTotal);
      if (isBetter(candidate, best)) best = candidate;
      return;
    }

    const remainingIndexes = participantOrder.slice(orderIndex);
    const compatibleByParticipant = remainingIndexes.map((participantIndex) =>
      candidatesByParticipant[participantIndex].filter((candidate) => !overlaps(candidate))
    );
    const possibleCount = compatibleByParticipant.filter((candidates) => candidates.length > 0).length;
    const assignedCount = occupiedStarts.length;
    if (best && assignedCount + possibleCount < best.meetingsAssigned) return;
    if (best && assignedCount + possibleCount === best.meetingsAssigned) {
      const preferredUpperBound = preferredSlotCount + compatibleByParticipant.reduce(
        (total, candidates) => total + Math.max(0, ...candidates.map((candidate) => candidate.preferredSlotCount)),
        0,
      );
      if (preferredUpperBound < best.preferredSlotCount) return;
      if (preferredUpperBound === best.preferredSlotCount) {
        const rankLowerBound = individualRankTotal + compatibleByParticipant.reduce(
          (total, candidates) => total + (candidates[0]?.individualRank ?? 0),
          0,
        );
        if (rankLowerBound > best.individualRankTotal) return;
      }
    }

    const participantIndex = participantOrder[orderIndex];
    for (const candidate of candidatesByParticipant[participantIndex]) {
      if (overlaps(candidate)) continue;
      currentAssignments[participantIndex] = candidate;
      occupiedStarts.push(candidate.startSlot);
      visit(
        orderIndex + 1,
        preferredSlotCount + candidate.preferredSlotCount,
        individualRankTotal + candidate.individualRank,
      );
      occupiedStarts.pop();
      currentAssignments[participantIndex] = undefined;
    }
    visit(orderIndex + 1, preferredSlotCount, individualRankTotal);
  };

  visit(0, 0, 0);
  return best ?? snapshot(0, 0);
}
