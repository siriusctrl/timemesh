import { describe, expect, test } from "vitest";
import { bitsetToSet, createBitset } from "../src/protocol/bits";
import {
  decodeBaseToken,
  decodeParticipantToken,
  decodeTokenBundle,
  encodeBaseToken,
  encodeParticipantToken,
} from "../src/protocol/codec";
import { createBaseAllocation } from "../src/protocol/time";

describe("TimeMesh Token v1", () => {
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
    expect(first.startsWith("tm1b_")).toBe(true);
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

    expect(participantToken.startsWith("tm1p_")).toBe(true);
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

  test("decodes a whitespace-composed planning bundle", async () => {
    const base = createBaseAllocation({
      startDate: "2026-11-01",
      days: 7,
      timezone: "Asia/Tokyo",
    });
    const baseToken = encodeBaseToken(base);
    const participant = await encodeParticipantToken(baseToken, base, [12, 13, 14]);
    const bundle = await decodeTokenBundle(`${baseToken}\n${participant}`);
    expect(bundle.base.timezone).toBe("Asia/Tokyo");
    expect(bundle.participants).toHaveLength(1);
  });
});
