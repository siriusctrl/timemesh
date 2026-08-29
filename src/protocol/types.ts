export const PROTOCOL_VERSION = 1 as const;
export const BASE_TOKEN_PREFIX = "tm1b_";
export const PARTICIPANT_TOKEN_PREFIX = "tm1p_";
export const DEFAULT_SLOT_MINUTES = 15 as const;
export const DEFAULT_WINDOW_DAYS = 14;
export const MAX_WINDOW_DAYS = 31;
export const MAX_SLOT_COUNT = MAX_WINDOW_DAYS * 24 * 4 + 8;

export type SlotMinutes = 15 | 30 | 60;

export type BaseAllocation = {
  version: typeof PROTOCOL_VERSION;
  kind: "base";
  slotMinutes: SlotMinutes;
  meetingMinutes: number;
  startEpochMinutes: number;
  slotCount: number;
  timezone: string;
  unavailable: Uint8Array;
};

export type ParticipantAllocation = {
  version: typeof PROTOCOL_VERSION;
  kind: "participant";
  baseRef: Uint8Array;
  free: Uint8Array;
};

export type TokenBundle = {
  baseToken: string;
  base: BaseAllocation;
  participantTokens: string[];
  participants: ParticipantAllocation[];
};

export type TimeRange = {
  start: string;
  end: string;
};

export class TokenError extends Error {
  constructor(
    public readonly code:
      | "invalid_prefix"
      | "invalid_encoding"
      | "invalid_length"
      | "invalid_checksum"
      | "invalid_contract"
      | "base_mismatch"
      | "missing_base",
    message: string,
  ) {
    super(message);
    this.name = "TokenError";
  }
}
