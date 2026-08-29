import { describe, expect, test } from "vitest";
import { createBitset } from "../src/protocol/bits";
import { findCandidateWindows } from "../src/protocol/planner";
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
});
