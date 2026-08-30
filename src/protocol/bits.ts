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

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function appendVarUint(target: number[], value: number): void {
  let remaining = value;
  do {
    const byte = remaining & 0x7f;
    remaining >>>= 7;
    target.push(remaining > 0 ? byte | 0x80 : byte);
  } while (remaining > 0);
}

export function encodeBitsetV2(bitset: Uint8Array, slotCount: number): Uint8Array {
  assertCanonicalBitset(bitset, slotCount);

  const raw = new Uint8Array(1 + bitset.length);
  raw[0] = 0;
  raw.set(bitset, 1);

  const first = getBit(bitset, 0);
  const runLengthBytes = [first ? 2 : 1];
  let current = first;
  let runLength = 0;
  for (let index = 0; index < slotCount; index += 1) {
    const value = getBit(bitset, index);
    if (value === current) {
      runLength += 1;
    } else {
      appendVarUint(runLengthBytes, runLength);
      current = value;
      runLength = 1;
    }
  }
  appendVarUint(runLengthBytes, runLength);
  const runLengthEncoding = Uint8Array.from(runLengthBytes);
  return runLengthEncoding.length < raw.length ? runLengthEncoding : raw;
}

export function decodeBitsetV2(encoded: Uint8Array, slotCount: number): Uint8Array {
  if (encoded.length < 1) {
    throw new TokenError("invalid_length", "Compressed bitmap is empty.");
  }

  const mode = encoded[0];
  let bitset: Uint8Array;
  if (mode === 0) {
    const expectedLength = 1 + byteLengthForSlots(slotCount);
    if (encoded.length !== expectedLength) {
      throw new TokenError(
        "invalid_length",
        `Raw bitmap encoding should contain ${expectedLength} bytes, received ${encoded.length}.`,
      );
    }
    bitset = encoded.slice(1);
    assertCanonicalBitset(bitset, slotCount);
  } else if (mode === 1 || mode === 2) {
    bitset = createBitset(slotCount);
    let offset = 1;
    let slotIndex = 0;
    let value = mode === 2;
    while (offset < encoded.length && slotIndex < slotCount) {
      let runLength = 0;
      let shift = 0;
      let byte = 0;
      do {
        if (offset >= encoded.length || shift > 14) {
          throw new TokenError("invalid_encoding", "Bitmap run length is malformed.");
        }
        byte = encoded[offset];
        offset += 1;
        runLength |= (byte & 0x7f) << shift;
        shift += 7;
      } while ((byte & 0x80) !== 0);

      if (runLength < 1 || slotIndex + runLength > slotCount) {
        throw new TokenError("invalid_length", "Bitmap runs do not match the declared slot count.");
      }
      if (value) {
        for (let index = slotIndex; index < slotIndex + runLength; index += 1) {
          setBit(bitset, index, true, slotCount);
        }
      }
      slotIndex += runLength;
      value = !value;
    }
    if (slotIndex !== slotCount || offset !== encoded.length) {
      throw new TokenError("invalid_length", "Bitmap runs do not consume the declared slot count exactly.");
    }
  } else {
    throw new TokenError("invalid_encoding", `Unknown bitmap encoding mode ${mode}.`);
  }

  if (!equalBytes(encodeBitsetV2(bitset, slotCount), encoded)) {
    throw new TokenError("invalid_encoding", "Bitmap encoding is not canonical.");
  }
  return bitset;
}
