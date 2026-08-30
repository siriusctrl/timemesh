import {
  assertCanonicalBitset,
  createBitset,
  decodeBitsetV2,
  encodeBitsetV2,
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
const PARTICIPANT_SLOT_COUNT_BYTES = 2;

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

function assertSlotCount(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_SLOT_COUNT) {
    throw new TokenError("invalid_contract", `Slot count must be between 1 and ${MAX_SLOT_COUNT}.`);
  }
}

function assertBaseContract(base: BaseAllocation): void {
  if (base.version !== PROTOCOL_VERSION) {
    throw new TokenError("invalid_contract", `Unsupported protocol version ${base.version}.`);
  }
  assertSlotMinutes(base.slotMinutes);
  assertMeetingMinutes(base.meetingMinutes, base.slotMinutes);
  if (!Number.isInteger(base.startEpochMinutes) || base.startEpochMinutes < 0 || base.startEpochMinutes > 0xffffffff) {
    throw new TokenError("invalid_contract", "Base start time is outside the supported range.");
  }
  assertSlotCount(base.slotCount);
  const timezoneBytes = encoder.encode(base.timezone);
  if (timezoneBytes.length < 1 || timezoneBytes.length > 255) {
    throw new TokenError("invalid_contract", "Time zone must encode to 1-255 bytes.");
  }
  assertTimeZone(base.timezone);
  assertCanonicalBitset(base.unavailable, base.slotCount);
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

export function encodeBaseToken(base: BaseAllocation): string {
  assertBaseContract(base);
  const timezoneBytes = encoder.encode(base.timezone);
  const bitmapBytes = encodeBitsetV2(base.unavailable, base.slotCount);
  const headerLength = 10;
  const payload = new Uint8Array(headerLength + timezoneBytes.length + bitmapBytes.length);
  const view = new DataView(payload.buffer);
  view.setUint8(0, base.slotMinutes);
  view.setUint16(1, base.meetingMinutes);
  view.setUint32(3, base.startEpochMinutes);
  view.setUint16(7, base.slotCount);
  view.setUint8(9, timezoneBytes.length);
  payload.set(timezoneBytes, headerLength);
  payload.set(bitmapBytes, headerLength + timezoneBytes.length);
  return `${BASE_TOKEN_PREFIX}${bytesToBase64Url(appendChecksum(payload))}`;
}

export function decodeBaseToken(token: string): BaseAllocation {
  const payload = decodeCheckedPayload(token, BASE_TOKEN_PREFIX);
  if (payload.length < 12) {
    throw new TokenError("invalid_length", "Base token is shorter than its required fields.");
  }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const slotMinutes = view.getUint8(0);
  assertSlotMinutes(slotMinutes);
  const meetingMinutes = view.getUint16(1);
  const startEpochMinutes = view.getUint32(3);
  const slotCount = view.getUint16(7);
  assertSlotCount(slotCount);
  const timezoneLength = view.getUint8(9);
  const bitmapOffset = 10 + timezoneLength;
  if (timezoneLength < 1 || payload.length <= bitmapOffset) {
    throw new TokenError("invalid_length", "Base token has incomplete time-zone or bitmap data.");
  }
  let timezone: string;
  try {
    timezone = decoder.decode(payload.subarray(10, bitmapOffset));
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
    unavailable: decodeBitsetV2(payload.subarray(bitmapOffset), slotCount),
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
  const encodedFree = encodeBitsetV2(free, base.slotCount);
  const bitmapOffset = BASE_REF_BYTES + PARTICIPANT_SLOT_COUNT_BYTES;
  const payload = new Uint8Array(bitmapOffset + encodedFree.length);
  payload.set(baseRef);
  new DataView(payload.buffer).setUint16(BASE_REF_BYTES, base.slotCount);
  payload.set(encodedFree, bitmapOffset);
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
  baseToken: string,
  base: BaseAllocation,
): Promise<ParticipantAllocation> {
  const payload = decodeCheckedPayload(token, PARTICIPANT_TOKEN_PREFIX);
  const bitmapOffset = BASE_REF_BYTES + PARTICIPANT_SLOT_COUNT_BYTES;
  if (payload.length <= bitmapOffset) {
    throw new TokenError("invalid_length", "Participant token has no availability bitmap.");
  }
  const slotCount = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint16(BASE_REF_BYTES);
  assertSlotCount(slotCount);
  const participant: ParticipantAllocation = {
    version: PROTOCOL_VERSION,
    kind: "participant",
    baseRef: payload.slice(0, BASE_REF_BYTES),
    free: decodeBitsetV2(payload.subarray(bitmapOffset), slotCount),
  };
  const expectedRef = await getBaseRef(baseToken);
  if (!equalBytes(expectedRef, participant.baseRef)) {
    throw new TokenError("base_mismatch", "Participant token belongs to a different base allocation.");
  }
  if (slotCount !== base.slotCount) {
    throw new TokenError("base_mismatch", "Participant slot count does not match its base allocation.");
  }
  assertCanonicalBitset(participant.free, base.slotCount);
  return participant;
}

export function extractTokens(input: string): string[] {
  return input.match(/tm2[bp]_[A-Za-z0-9_-]+/gu) ?? [];
}

export async function decodeTokenBundle(input: string): Promise<TokenBundle> {
  const tokens = extractTokens(input);
  const baseTokens = [...new Set(
    tokens.filter((token) => token.startsWith(BASE_TOKEN_PREFIX)),
  )];
  if (baseTokens.length === 0) {
    throw new TokenError("missing_base", "Paste one base token before participant tokens.");
  }
  if (baseTokens.length > 1) {
    throw new TokenError("invalid_contract", "A token bundle may contain only one distinct base token.");
  }
  const baseToken = baseTokens[0];
  const base = decodeBaseToken(baseToken);
  const participantTokens = [...new Set(
    tokens.filter((token) => token.startsWith(PARTICIPANT_TOKEN_PREFIX)),
  )];
  const participants = await Promise.all(
    participantTokens.map((participantToken) => decodeParticipantToken(participantToken, baseToken, base)),
  );
  return { baseToken, base, participantTokens, participants };
}
