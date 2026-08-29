import {
  assertCanonicalBitset,
  byteLengthForSlots,
  createBitset,
} from "./bits";
import { appendChecksum, checksumMatches } from "./crc32";
import {
  BASE_TOKEN_PREFIX,
  MAX_SLOT_COUNT,
  PARTICIPANT_TOKEN_PREFIX,
  PROTOCOL_VERSION,
  TokenError,
  type BaseAllocation,
  type ParticipantAllocation,
  type SlotMinutes,
  type TokenBundle,
} from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const BASE_REF_BYTES = 8;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new TokenError("invalid_encoding", "Token payload is not canonical Base64URL.");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytesToBase64Url(bytes) !== value) {
      throw new TokenError("invalid_encoding", "Token payload is not canonical Base64URL.");
    }
    return bytes;
  } catch (error) {
    if (error instanceof TokenError) throw error;
    throw new TokenError("invalid_encoding", "Token payload could not be decoded.");
  }
}

function assertSlotMinutes(value: number): asserts value is SlotMinutes {
  if (value !== 15 && value !== 30 && value !== 60) {
    throw new TokenError("invalid_contract", `Unsupported slot size ${value}.`);
  }
}

function assertMeetingMinutes(value: number, slotMinutes: SlotMinutes): void {
  if (value < slotMinutes || value > 240 || value % slotMinutes !== 0) {
    throw new TokenError(
      "invalid_contract",
      `Meeting duration must be a multiple of ${slotMinutes} minutes and no more than 240 minutes.`,
    );
  }
}

function assertTimeZone(value: string): void {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
  } catch {
    throw new TokenError("invalid_contract", `Unknown IANA time zone ${value}.`);
  }
}

function assertBaseContract(base: BaseAllocation): void {
  assertSlotMinutes(base.slotMinutes);
  assertMeetingMinutes(base.meetingMinutes, base.slotMinutes);
  if (!Number.isInteger(base.startEpochMinutes) || base.startEpochMinutes < 0 || base.startEpochMinutes > 0xffffffff) {
    throw new TokenError("invalid_contract", "Base start time is outside the supported range.");
  }
  if (!Number.isInteger(base.slotCount) || base.slotCount < 1 || base.slotCount > MAX_SLOT_COUNT) {
    throw new TokenError("invalid_contract", `Slot count must be between 1 and ${MAX_SLOT_COUNT}.`);
  }
  const timezoneBytes = encoder.encode(base.timezone);
  if (timezoneBytes.length < 1 || timezoneBytes.length > 255) {
    throw new TokenError("invalid_contract", "Time zone must encode to 1-255 bytes.");
  }
  assertTimeZone(base.timezone);
  assertCanonicalBitset(base.unavailable, base.slotCount);
}

export function encodeBaseToken(base: BaseAllocation): string {
  assertBaseContract(base);
  const timezoneBytes = encoder.encode(base.timezone);
  const headerLength = 10;
  const payload = new Uint8Array(headerLength + timezoneBytes.length + base.unavailable.length);
  const view = new DataView(payload.buffer);
  view.setUint8(0, base.slotMinutes);
  view.setUint16(1, base.meetingMinutes);
  view.setUint32(3, base.startEpochMinutes);
  view.setUint16(7, base.slotCount);
  view.setUint8(9, timezoneBytes.length);
  payload.set(timezoneBytes, headerLength);
  payload.set(base.unavailable, headerLength + timezoneBytes.length);
  return `${BASE_TOKEN_PREFIX}${bytesToBase64Url(appendChecksum(payload))}`;
}

function decodeCheckedPayload(token: string, prefix: string): Uint8Array {
  const normalized = token.trim();
  if (!normalized.startsWith(prefix)) {
    throw new TokenError("invalid_prefix", `Expected a ${prefix.slice(0, -1)} token.`);
  }
  const bytes = base64UrlToBytes(normalized.slice(prefix.length));
  if (!checksumMatches(bytes)) {
    throw new TokenError("invalid_checksum", "Token checksum does not match its payload.");
  }
  return bytes.subarray(0, bytes.length - 4);
}

export function decodeBaseToken(token: string): BaseAllocation {
  const payload = decodeCheckedPayload(token, BASE_TOKEN_PREFIX);
  if (payload.length < 11) {
    throw new TokenError("invalid_length", "Base token is shorter than its required header.");
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const slotMinutes = view.getUint8(0);
  assertSlotMinutes(slotMinutes);
  const meetingMinutes = view.getUint16(1);
  const startEpochMinutes = view.getUint32(3);
  const slotCount = view.getUint16(7);
  const timezoneLength = view.getUint8(9);
  const bitsetLength = byteLengthForSlots(slotCount);
  const expectedLength = 10 + timezoneLength + bitsetLength;
  if (payload.length !== expectedLength) {
    throw new TokenError(
      "invalid_length",
      `Base payload should contain ${expectedLength} bytes, received ${payload.length}.`,
    );
  }
  let timezone: string;
  try {
    timezone = decoder.decode(payload.subarray(10, 10 + timezoneLength));
  } catch {
    throw new TokenError("invalid_encoding", "Time zone text is not valid UTF-8.");
  }
  const base: BaseAllocation = {
    version: PROTOCOL_VERSION,
    kind: "base",
    slotMinutes,
    meetingMinutes,
    startEpochMinutes,
    slotCount,
    timezone,
    unavailable: payload.slice(10 + timezoneLength),
  };
  assertBaseContract(base);
  return base;
}

export async function getBaseRef(baseToken: string): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(baseToken.trim()));
  return new Uint8Array(digest).slice(0, BASE_REF_BYTES);
}

export function baseRefLabel(baseRef: Uint8Array): string {
  return [...baseRef].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function encodeParticipantToken(
  baseToken: string,
  base: BaseAllocation,
  freeSlots: Iterable<number>,
): Promise<string> {
  if (encodeBaseToken(base) !== baseToken.trim()) {
    throw new TokenError("base_mismatch", "The decoded base does not match the supplied base token.");
  }
  const baseRef = await getBaseRef(baseToken);
  const free = createBitset(base.slotCount, freeSlots);
  const payload = new Uint8Array(BASE_REF_BYTES + free.length);
  payload.set(baseRef);
  payload.set(free, BASE_REF_BYTES);
  return `${PARTICIPANT_TOKEN_PREFIX}${bytesToBase64Url(appendChecksum(payload))}`;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function decodeParticipantToken(
  token: string,
  baseToken?: string,
  base?: BaseAllocation,
): Promise<ParticipantAllocation> {
  const payload = decodeCheckedPayload(token, PARTICIPANT_TOKEN_PREFIX);
  if (payload.length <= BASE_REF_BYTES) {
    throw new TokenError("invalid_length", "Participant token has no availability bitmap.");
  }
  const participant: ParticipantAllocation = {
    version: PROTOCOL_VERSION,
    kind: "participant",
    baseRef: payload.slice(0, BASE_REF_BYTES),
    free: payload.slice(BASE_REF_BYTES),
  };
  if (baseToken || base) {
    if (!baseToken || !base) {
      throw new TokenError("missing_base", "Both the base token and decoded base are required.");
    }
    const expectedRef = await getBaseRef(baseToken);
    if (!equalBytes(expectedRef, participant.baseRef)) {
      throw new TokenError("base_mismatch", "Participant token belongs to a different base allocation.");
    }
    assertCanonicalBitset(participant.free, base.slotCount);
  } else if (participant.free.length > byteLengthForSlots(MAX_SLOT_COUNT)) {
    throw new TokenError("invalid_length", "Participant bitmap exceeds the one-month protocol limit.");
  }
  return participant;
}

export function extractTokens(input: string): string[] {
  return input.match(/tm1[bp]_[A-Za-z0-9_-]+/gu) ?? [];
}

export async function decodeTokenBundle(input: string): Promise<TokenBundle> {
  const tokens = extractTokens(input);
  const baseTokens = tokens.filter((token) => token.startsWith(BASE_TOKEN_PREFIX));
  if (baseTokens.length === 0) {
    throw new TokenError("missing_base", "Paste one base token before participant tokens.");
  }
  if (baseTokens.length > 1) {
    throw new TokenError("invalid_contract", "A planning bundle may contain exactly one base token.");
  }
  const baseToken = baseTokens[0];
  const base = decodeBaseToken(baseToken);
  const participantTokens = tokens.filter((token) => token.startsWith(PARTICIPANT_TOKEN_PREFIX));
  const participants = await Promise.all(
    participantTokens.map((token) => decodeParticipantToken(token, baseToken, base)),
  );
  return { baseToken, base, participantTokens, participants };
}
