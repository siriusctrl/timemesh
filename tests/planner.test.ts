import { describe, expect, test } from "vitest";
import { createBitset } from "../src/protocol/bits";
import { allocateIndividualMeetings, findCandidateWindows } from "../src/protocol/planner";
import { createBaseAllocation } from "../src/protocol/time";
import { PROTOCOL_VERSION, type ParticipantAllocation } from "../src/protocol/types";

describe("overlap planner", () => {
  test("ranks windows by participants free for the full meeting", () => {
    const initial = createBaseAllocation({
      startDate: "2026-09-01",
      days: 1,
      timezone: "UTC",
      meetingMinutes: 30,
    });
    const base = { ...initial, unavailable: createBitset(initial.slotCount, [0, 1, 2, 3]) };
    const participant = (indices: number[]): ParticipantAllocation => ({
      version: PROTOCOL_VERSION,
      kind: "participant",
      baseRef: new Uint8Array(8),
      free: createBitset(base.slotCount, indices),
    });
    const participants = [
      participant([8, 9, 10, 11]),
      participant([9, 10, 11, 12]),
      participant([10, 11]),
    ];
    const [best] = findCandidateWindows(base, participants);
    expect(best.startSlot).toBe(10);
    expect(best.endSlot).toBe(12);
    expect(best.attendeeCount).toBe(3);
    expect(best.participantIndexes).toEqual([0, 1, 2]);
  });

  test("does not cross an organizer-unavailable slot", () => {
    const initial = createBaseAllocation({
      startDate: "2026-09-01",
      days: 1,
      timezone: "UTC",
      meetingMinutes: 60,
    });
    const base = { ...initial, unavailable: createBitset(initial.slotCount, [10]) };
    const candidates = findCandidateWindows(base, []);
    expect(candidates.some((candidate) => candidate.startSlot <= 10 && candidate.endSlot > 10)).toBe(false);
  });

  test("surfaces the best window from different days before overlapping alternatives", () => {
    const base = createBaseAllocation({
      startDate: "2026-09-01",
      days: 3,
      timezone: "UTC",
      meetingMinutes: 60,
    });
    const candidates = findCandidateWindows(base, [], 3);
    expect(candidates.map((candidate) => Math.floor(candidate.startSlot / 96))).toEqual([0, 1, 2]);
  });

  test("applies owner constraints and uses preferred time only as an attendance tie-break", () => {
    const base = createBaseAllocation({
      startDate: "2026-09-01",
      days: 1,
      timezone: "UTC",
      meetingMinutes: 30,
    });
    const participant = (indices: number[]): ParticipantAllocation => ({
      version: PROTOCOL_VERSION,
      kind: "participant",
      baseRef: new Uint8Array(8),
      free: createBitset(base.slotCount, indices),
    });
    const participants = [
      participant([40, 41, 48, 49]),
      participant([40, 41]),
    ];
    const allowedSlots = new Set([40, 41, 48, 49]);
    const preferredSlots = new Set([48, 49]);
    const candidates = findCandidateWindows(base, participants, {
      allowedSlots,
      preferredSlots,
      minimumAttendees: 1,
      limit: 2,
    });

    expect(candidates.map((candidate) => candidate.startSlot)).toEqual([40, 48]);
    expect(candidates.map((candidate) => candidate.attendeeCount)).toEqual([2, 1]);
    expect(candidates[1].preferredSlotCount).toBe(2);
  });

  test("uses preferred slots to order windows with equal attendance", () => {
    const base = createBaseAllocation({
      startDate: "2026-09-01",
      days: 1,
      timezone: "UTC",
      meetingMinutes: 30,
    });
    const participant: ParticipantAllocation = {
      version: PROTOCOL_VERSION,
      kind: "participant",
      baseRef: new Uint8Array(8),
      free: createBitset(base.slotCount, [40, 41, 48, 49]),
    };
    const [best] = findCandidateWindows(base, [participant], {
      allowedSlots: new Set([40, 41, 48, 49]),
      preferredSlots: new Set([48, 49]),
      limit: 1,
    });

    expect(best.startSlot).toBe(48);
    expect(best.preferredSlotCount).toBe(2);
  });

  test("backtracks to assign one non-overlapping meeting per participant", () => {
    const base = createBaseAllocation({
      startDate: "2026-09-01",
      days: 1,
      timezone: "UTC",
      meetingMinutes: 60,
    });
    const participant = (indices: number[]): ParticipantAllocation => ({
      version: PROTOCOL_VERSION,
      kind: "participant",
      baseRef: new Uint8Array(8),
      free: createBitset(base.slotCount, indices),
    });
    const allocation = allocateIndividualMeetings(base, [
      participant([36, 37, 38, 39, 40, 41, 42, 43]),
      participant([36, 37, 38, 39]),
    ]);

    expect(allocation.meetingsAssigned).toBe(2);
    expect(allocation.unassignedParticipantIndexes).toEqual([]);
    expect(allocation.assignments).toEqual([
      expect.objectContaining({ participantIndex: 0, startSlot: 40, endSlot: 44, individualRank: 5 }),
      expect.objectContaining({ participantIndex: 1, startSlot: 36, endSlot: 40, individualRank: 1 }),
    ]);
  });

  test("uses response order to resolve an unavoidable individual scheduling conflict", () => {
    const base = createBaseAllocation({
      startDate: "2026-09-01",
      days: 1,
      timezone: "UTC",
      meetingMinutes: 60,
    });
    const participant = (): ParticipantAllocation => ({
      version: PROTOCOL_VERSION,
      kind: "participant",
      baseRef: new Uint8Array(8),
      free: createBitset(base.slotCount, [36, 37, 38, 39]),
    });
    const allocation = allocateIndividualMeetings(base, [participant(), participant()]);

    expect(allocation.meetingsAssigned).toBe(1);
    expect(allocation.assignments[0]).toMatchObject({ participantIndex: 0, startSlot: 36 });
    expect(allocation.unassignedParticipantIndexes).toEqual([1]);
    expect(allocation.candidateCounts).toEqual([1, 1]);
  });
});
