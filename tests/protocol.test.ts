import { describe, expect, test } from "vitest";
import { bitsetToSet, createBitset, decodeBitsetV2, encodeBitsetV2 } from "../src/protocol/bits";
import {
  decodeBaseToken,
  decodeParticipantToken,
  decodeTokenBundle,
  encodeBaseToken,
  encodeParticipantToken,
} from "../src/protocol/codec";
import { createBaseAllocation, excludeOrganizerConflicts, workHoursSlotSet } from "../src/protocol/time";

const GOLDEN_BASE = "tm2b_DwA8AcbCwAVADUFzaWEvU2hhbmdoYWkCAxwBnwoB-20Utg";
const GOLDEN_PARTICIPANT = "tm2p_10VrkaG4nj4CoAEoBCQBzwSx0AjZ";

describe("TimeMesh Token v2", () => {
  test("round-trips a deterministic 15-minute base token", () => {
    const initial = createBaseAllocation({
      startDate: "2026-09-01",
      days: 14,
      timezone: "Asia/Shanghai",
      meetingMinutes: 60,
    });
    const unavailable = new Set([0, 1, 2, 31, initial.slotCount - 1]);
    const base = { ...initial, unavailable: createBitset(initial.slotCount, unavailable) };
    const first = encodeBaseToken(base);
    const second = encodeBaseToken(base);
    const decoded = decodeBaseToken(first);

    expect(first).toBe(second);
    expect(first).toBe(GOLDEN_BASE);
    expect(first.startsWith("tm2b_")).toBe(true);
    expect(decoded.slotMinutes).toBe(15);
    expect(decoded.slotCount).toBe(14 * 24 * 4);
    expect(decoded.timezone).toBe("Asia/Shanghai");
    expect(bitsetToSet(decoded.unavailable, decoded.slotCount)).toEqual(unavailable);
  });

  test("binds a participant token without repeating base fields", async () => {
    const base = createBaseAllocation({
      startDate: "2026-09-01",
      days: 7,
      timezone: "Europe/London",
      meetingMinutes: 30,
    });
    const baseToken = encodeBaseToken(base);
    const free = new Set([40, 41, 42, 43, 80]);
    const participantToken = await encodeParticipantToken(baseToken, base, free);
    const participant = await decodeParticipantToken(participantToken, baseToken, base);

    expect(participantToken).toBe(GOLDEN_PARTICIPANT);
    expect(participantToken.startsWith("tm2p_")).toBe(true);
    expect(bitsetToSet(participant.free, base.slotCount)).toEqual(free);
    expect(participantToken).not.toContain("Europe");

    const otherBase = createBaseAllocation({
      startDate: "2026-09-02",
      days: 7,
      timezone: "Europe/London",
      meetingMinutes: 30,
    });
    const otherToken = encodeBaseToken(otherBase);
    await expect(
      decodeParticipantToken(participantToken, otherToken, otherBase),
    ).rejects.toMatchObject({ code: "base_mismatch" });
  });

  test("rejects a corrupted checksum", () => {
    const base = createBaseAllocation({
      startDate: "2026-09-01",
      days: 7,
      timezone: "UTC",
    });
    const token = encodeBaseToken(base);
    const index = Math.floor(token.length / 2);
    const replacement = token[index] === "A" ? "B" : "A";
    const corrupted = `${token.slice(0, index)}${replacement}${token.slice(index + 1)}`;
    expect(() => decodeBaseToken(corrupted)).toThrowError(/checksum/u);
  });

  test("rejects a noncanonical Base64URL spelling of the same bytes", () => {
    const base = createBaseAllocation({
      startDate: "2026-09-01",
      days: 7,
      timezone: "UTC",
    });
    const token = encodeBaseToken(base);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const finalIndex = alphabet.indexOf(token.at(-1)!);
    const noncanonicalFinal = alphabet[(finalIndex & 0b111100) | 0b000001];
    const noncanonical = `${token.slice(0, -1)}${noncanonicalFinal}`;
    expect(() => decodeBaseToken(noncanonical)).toThrowError(/canonical Base64URL/u);
  });

  test("uses elapsed absolute slots across a daylight-saving boundary", () => {
    const base = createBaseAllocation({
      startDate: "2026-03-08",
      days: 2,
      timezone: "America/New_York",
    });
    expect(base.slotCount).toBe(47 * 4);
    expect(decodeBaseToken(encodeBaseToken(base)).slotCount).toBe(188);
  });

  test("maps minute-precise weekday hours and rejects an inverted range", () => {
    const base = createBaseAllocation({
      startDate: "2026-09-01",
      days: 1,
      timezone: "UTC",
    });
    const workHours = workHoursSlotSet(base, "UTC", 7 * 60 + 30, 21 * 60 + 15);

    expect(workHours.size).toBe(55);
    expect(workHours.has(29)).toBe(false);
    expect(workHours.has(30)).toBe(true);
    expect(workHours.has(84)).toBe(true);
    expect(workHours.has(85)).toBe(false);
    expect(() => workHoursSlotSet(base, "UTC", 20 * 60, 8 * 60)).toThrowError(/ordered range/u);
  });

  test("separates participant requests from organizer conflicts", () => {
    const initial = createBaseAllocation({
      startDate: "2026-09-01",
      days: 1,
      timezone: "UTC",
    });
    const base = { ...initial, unavailable: createBitset(initial.slotCount, [2, 3]) };
    const result = excludeOrganizerConflicts(base, [1, 2, 3, 4]);

    expect(result.free).toEqual(new Set([1, 4]));
    expect(result.conflicts).toEqual(new Set([2, 3]));
  });

  test("decodes a whitespace-composed token bundle", async () => {
    const base = createBaseAllocation({
      startDate: "2026-11-01",
      days: 7,
      timezone: "Asia/Tokyo",
    });
    const baseToken = encodeBaseToken(base);
    const participant = await encodeParticipantToken(baseToken, base, [12, 13, 14]);
    const bundle = await decodeTokenBundle(`${baseToken}\n${participant}\n${baseToken}\n${participant}`);
    expect(bundle.base.timezone).toBe("Asia/Tokyo");
    expect(bundle.participants).toHaveLength(1);
    expect(bundle.participantTokens).toEqual([participant]);
  });

  test("compresses a regular two-week schedule and round-trips its canonical bitmap", async () => {
    const initial = createBaseAllocation({
      startDate: "2026-09-01",
      days: 14,
      timezone: "Asia/Shanghai",
      meetingMinutes: 60,
    });
    const workHours = workHoursSlotSet(initial, initial.timezone, 9 * 60, 18 * 60, true);
    const unavailable = new Set<number>();
    for (let index = 0; index < initial.slotCount; index += 1) {
      if (!workHours.has(index)) unavailable.add(index);
    }
    const base = { ...initial, unavailable: createBitset(initial.slotCount, unavailable) };
    const baseToken = encodeBaseToken(base);
    const participantToken = await encodeParticipantToken(baseToken, base, workHours);

    expect(baseToken.length).toBeLessThan(80);
    expect(participantToken.length).toBeLessThan(60);
    expect([...baseToken].filter((character) => character === "_")).toHaveLength(1);
    expect(bitsetToSet(decodeBaseToken(baseToken).unavailable, base.slotCount)).toEqual(unavailable);
    expect(bitsetToSet(
      (await decodeParticipantToken(participantToken, baseToken, base)).free,
      base.slotCount,
    )).toEqual(workHours);
  });

  test("rejects a longer noncanonical bitmap spelling", () => {
    const slotCount = 96;
    const bitset = createBitset(slotCount);
    expect(encodeBitsetV2(bitset, slotCount).length).toBeLessThan(bitset.length + 1);
    expect(() => decodeBitsetV2(Uint8Array.of(0, ...bitset), slotCount)).toThrowError(/canonical/u);
  });
});
