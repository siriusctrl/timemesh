#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { countBits, createBitset, getBit } from "../../../src/protocol/bits";
import {
  baseRefLabel,
  decodeBaseToken,
  decodeParticipantToken,
  decodeTokenBundle,
  encodeBaseToken,
  encodeParticipantToken,
  formatTokenBundle,
} from "../../../src/protocol/codec";
import { findCandidateWindows } from "../../../src/protocol/planner";
import {
  baseStartDate,
  baseWindowDays,
  createBaseAllocation,
  describeBaseRange,
  excludeOrganizerConflicts,
  rangesToSlotSet,
  slotInstant,
} from "../../../src/protocol/time";
import {
  BASE_TOKEN_PREFIX,
  PARTICIPANT_TOKEN_PREFIX,
  type BaseAllocation,
  type SlotMinutes,
  type TimeRange,
} from "../../../src/protocol/types";

function usage(): never {
  console.error(`Usage:
  time-token base --start YYYY-MM-DD --days N --timezone Area/City [--slot 15] [--meeting 60] [--unavailable-json path]
  time-token participant --base tm2b_... --free-json path [--output token|bundle] [--name NAME] [--base-name NAME]
  time-token compare --bundle-file path [--preferences-json path] [--timezone Area/City] [--limit 12]
  time-token validate TOKEN [--base tm2b_...]
  time-token decode TOKEN [--base tm2b_...]`);
  process.exit(2);
}

function parseArgs(values: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key.startsWith("--") || index + 1 >= values.length) usage();
    result.set(key.slice(2), values[index + 1]);
    index += 1;
  }
  return result;
}

function required(args: Map<string, string>, name: string): string {
  const value = args.get(name);
  if (!value) {
    console.error(`Missing --${name}.`);
    usage();
  }
  return value;
}

async function readJson(path: string): Promise<{ absolute: string; value: unknown }> {
  const absolute = resolve(path);
  return { absolute, value: JSON.parse(await readFile(absolute, "utf8")) as unknown };
}

function parseRanges(value: unknown, label: string): TimeRange[] {
  const ranges = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null && Array.isArray((value as { ranges?: unknown }).ranges)
      ? (value as { ranges: unknown[] }).ranges
      : null;
  if (!ranges) throw new Error(`${label} must contain a ranges array.`);
  return ranges.map((item, index) => {
    if (
      typeof item !== "object" || item === null ||
      typeof (item as { start?: unknown }).start !== "string" ||
      typeof (item as { end?: unknown }).end !== "string"
    ) {
      throw new Error(`Range ${index + 1} must contain string start and end values.`);
    }
    return { start: (item as TimeRange).start, end: (item as TimeRange).end };
  });
}

async function readRanges(path: string): Promise<TimeRange[]> {
  const { absolute, value } = await readJson(path);
  return parseRanges(value, absolute);
}

type OwnerPreferences = {
  minimumAttendees?: number;
  allowedRanges?: TimeRange[];
  preferredRanges?: TimeRange[];
};

async function readPreferences(path: string): Promise<OwnerPreferences> {
  const { absolute, value } = await readJson(path);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${absolute} must contain a JSON object.`);
  }
  const input = value as Record<string, unknown>;
  const minimumAttendees = input.minimumAttendees;
  if (minimumAttendees !== undefined && (!Number.isInteger(minimumAttendees) || Number(minimumAttendees) < 0)) {
    throw new Error("minimumAttendees must be a non-negative integer.");
  }
  return {
    minimumAttendees: minimumAttendees as number | undefined,
    allowedRanges: input.allowedRanges === undefined
      ? undefined
      : parseRanges(input.allowedRanges, "allowedRanges"),
    preferredRanges: input.preferredRanges === undefined
      ? undefined
      : parseRanges(input.preferredRanges, "preferredRanges"),
  };
}

function timeZoneOrThrow(value: string): string {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return value;
  } catch {
    throw new Error(`Unknown IANA time zone ${value}.`);
  }
}

function selectedRanges(base: BaseAllocation, bitset: Uint8Array) {
  const ranges: Array<{ start: string; end: string }> = [];
  let start: number | null = null;
  for (let index = 0; index <= base.slotCount; index += 1) {
    const selected = index < base.slotCount && getBit(bitset, index);
    if (selected && start === null) start = index;
    if (!selected && start !== null) {
      ranges.push({
        start: slotInstant(base, start).toZonedDateTimeISO(base.timezone).toString(),
        end: slotInstant(base, index).toZonedDateTimeISO(base.timezone).toString(),
      });
      start = null;
    }
  }
  return ranges;
}

function baseSummary(base: BaseAllocation) {
  return {
    kind: base.kind,
    version: base.version,
    startDate: baseStartDate(base),
    days: baseWindowDays(base),
    range: describeBaseRange(base),
    timezone: base.timezone,
    slotMinutes: base.slotMinutes,
    meetingMinutes: base.meetingMinutes,
    slotCount: base.slotCount,
    unavailableSlotCount: countBits(base.unavailable, base.slotCount),
    unavailableRanges: selectedRanges(base, base.unavailable),
  };
}

const [command, tokenArgument, ...rest] = process.argv.slice(2);

try {
  if (command === "base") {
    const args = parseArgs(process.argv.slice(3));
    const slotMinutes = Number(args.get("slot") ?? 15) as SlotMinutes;
    const meetingMinutes = Number(args.get("meeting") ?? 60);
    const initial = createBaseAllocation({
      startDate: required(args, "start"),
      days: Number(required(args, "days")),
      timezone: required(args, "timezone"),
      slotMinutes,
      meetingMinutes,
    });
    const unavailablePath = args.get("unavailable-json");
    const unavailable = unavailablePath
      ? rangesToSlotSet(initial, await readRanges(unavailablePath), "unavailable")
      : new Set<number>();
    const base = { ...initial, unavailable: createBitset(initial.slotCount, unavailable) };
    const token = encodeBaseToken(base);
    console.log(token);
    console.error(JSON.stringify(baseSummary(base), null, 2));
  } else if (command === "participant") {
    const args = parseArgs(process.argv.slice(3));
    const baseToken = required(args, "base");
    const base = decodeBaseToken(baseToken);
    const ranges = await readRanges(required(args, "free-json"));
    const requestedFree = rangesToSlotSet(base, ranges, "free");
    const { free, conflicts } = excludeOrganizerConflicts(base, requestedFree);
    const token = await encodeParticipantToken(baseToken, base, free);
    const decoded = await decodeParticipantToken(token, baseToken, base);
    const output = args.get("output") ?? "token";
    if (output !== "token" && output !== "bundle") {
      throw new Error("--output must be token or bundle.");
    }
    console.log(output === "bundle"
      ? formatTokenBundle(baseToken.trim(), [token], {
          base: args.get("base-name"),
          participants: [args.get("name")],
        })
      : token);
    console.error(JSON.stringify({
      kind: decoded.kind,
      baseRef: baseRefLabel(decoded.baseRef),
      range: describeBaseRange(base),
      timezone: base.timezone,
      slotMinutes: base.slotMinutes,
      requestedFreeSlotCount: requestedFree.size,
      freeSlotCount: countBits(decoded.free, base.slotCount),
      freeRanges: selectedRanges(base, decoded.free),
      organizerConflictSlotCount: conflicts.size,
      organizerConflictRanges: selectedRanges(base, createBitset(base.slotCount, conflicts)),
    }, null, 2));
  } else if (command === "compare") {
    const args = parseArgs(process.argv.slice(3));
    const bundlePath = resolve(required(args, "bundle-file"));
    const bundle = await decodeTokenBundle(await readFile(bundlePath, "utf8"));
    const preferences = args.get("preferences-json")
      ? await readPreferences(required(args, "preferences-json"))
      : {};
    if ((preferences.minimumAttendees ?? 0) > bundle.participants.length) {
      throw new Error(`minimumAttendees cannot exceed the ${bundle.participants.length} responses in the bundle.`);
    }
    const limit = Number(args.get("limit") ?? 12);
    if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer.");
    const displayTimezone = timeZoneOrThrow(args.get("timezone") ?? bundle.base.timezone);
    const allowedSlots = preferences.allowedRanges === undefined
      ? undefined
      : rangesToSlotSet(bundle.base, preferences.allowedRanges, "free");
    const preferredSlots = preferences.preferredRanges === undefined
      ? undefined
      : rangesToSlotSet(bundle.base, preferences.preferredRanges, "free");
    const candidates = findCandidateWindows(bundle.base, bundle.participants, {
      limit,
      minimumAttendees: preferences.minimumAttendees,
      allowedSlots,
      preferredSlots,
      diversifyDays: false,
    });
    const durationSlots = bundle.base.meetingMinutes / bundle.base.slotMinutes;
    console.log(JSON.stringify({
      kind: "comparison",
      base: baseSummary(bundle.base),
      displayTimezone,
      responseCount: bundle.participants.length,
      uniqueResponseTokenCount: new Set(bundle.participantTokens).size,
      preferences,
      rankingPolicy: [
        "Organizer availability and allowedRanges are hard constraints.",
        "minimumAttendees removes candidates below the requested attendance.",
        "More available participants ranks first.",
        "preferredRanges breaks ties without outranking attendance.",
        "Earlier windows break remaining ties.",
      ],
      candidates: candidates.map((candidate, index) => ({
        rank: index + 1,
        start: slotInstant(bundle.base, candidate.startSlot).toZonedDateTimeISO(displayTimezone).toString(),
        end: slotInstant(bundle.base, candidate.endSlot).toZonedDateTimeISO(displayTimezone).toString(),
        attendeeCount: candidate.attendeeCount,
        participantCount: candidate.participantCount,
        responseNumbers: candidate.participantIndexes.map((participantIndex) => participantIndex + 1),
        responseNames: candidate.participantIndexes.map((participantIndex) =>
          bundle.participantLabels[participantIndex] || `Response ${participantIndex + 1}`
        ),
        preferredSlotCount: candidate.preferredSlotCount,
        fullyPreferred: preferredSlots !== undefined && candidate.preferredSlotCount === durationSlots,
      })),
    }, null, 2));
  } else if (command === "validate" || command === "decode") {
    if (!tokenArgument) usage();
    const args = parseArgs(rest);
    if (tokenArgument.startsWith(BASE_TOKEN_PREFIX)) {
      const base = decodeBaseToken(tokenArgument);
      if (command === "validate") console.log("VALID base token");
      else console.log(JSON.stringify(baseSummary(base), null, 2));
    } else if (tokenArgument.startsWith(PARTICIPANT_TOKEN_PREFIX)) {
      const baseToken = required(args, "base");
      const base = decodeBaseToken(baseToken);
      const participant = await decodeParticipantToken(tokenArgument, baseToken, base);
      if (command === "validate") console.log("VALID participant token");
      else console.log(JSON.stringify({
        kind: participant.kind,
        baseRef: baseRefLabel(participant.baseRef),
        freeSlotCount: countBits(participant.free, base.slotCount),
        freeRanges: selectedRanges(base, participant.free),
      }, null, 2));
    } else {
      throw new Error("Token must start with tm2b_ or tm2p_.");
    }
  } else {
    usage();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
