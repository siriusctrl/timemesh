import { TokenError } from "./types";

export function byteLengthForSlots(slotCount: number): number {
  return Math.ceil(slotCount / 8);
}

export function createBitset(slotCount: number, indices: Iterable<number> = []): Uint8Array {
  const result = new Uint8Array(byteLengthForSlots(slotCount));
  for (const index of indices) setBit(result, index, true, slotCount);
  return result;
}

export function setBit(
  bitset: Uint8Array,
  index: number,
  value: boolean,
  slotCount = bitset.length * 8,
): void {
  if (!Number.isInteger(index) || index < 0 || index >= slotCount) {
    throw new RangeError(`Slot index ${index} is outside 0-${slotCount - 1}`);
  }
  const byteIndex = Math.floor(index / 8);
  const mask = 1 << (index % 8);
  if (value) bitset[byteIndex] |= mask;
  else bitset[byteIndex] &= ~mask;
}

export function getBit(bitset: Uint8Array, index: number): boolean {
  if (!Number.isInteger(index) || index < 0 || index >= bitset.length * 8) return false;
  return (bitset[Math.floor(index / 8)] & (1 << (index % 8))) !== 0;
}

export function bitsetToSet(bitset: Uint8Array, slotCount: number): Set<number> {
  const result = new Set<number>();
  for (let index = 0; index < slotCount; index += 1) {
    if (getBit(bitset, index)) result.add(index);
  }
  return result;
}

export function assertCanonicalBitset(bitset: Uint8Array, slotCount: number): void {
  const expected = byteLengthForSlots(slotCount);
  if (bitset.length !== expected) {
    throw new TokenError(
      "invalid_length",
      `Expected ${expected} availability bytes for ${slotCount} slots, received ${bitset.length}.`,
    );
  }
  const usedBits = slotCount % 8;
  if (usedBits === 0 || bitset.length === 0) return;
  const unusedMask = 0xff << usedBits;
  if ((bitset[bitset.length - 1] & unusedMask) !== 0) {
    throw new TokenError("invalid_contract", "Unused availability bits must be zero.");
  }
}

export function countBits(bitset: Uint8Array, slotCount: number): number {
  let count = 0;
  for (let index = 0; index < slotCount; index += 1) {
    if (getBit(bitset, index)) count += 1;
  }
  return count;
}
