const CRC_TABLE = new Uint32Array(256);

for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  CRC_TABLE[index] = value >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  let checksum = 0xffffffff;
  for (const byte of bytes) {
    checksum = CRC_TABLE[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  }
  return (checksum ^ 0xffffffff) >>> 0;
}

export function appendChecksum(bytes: Uint8Array): Uint8Array {
  const result = new Uint8Array(bytes.length + 4);
  result.set(bytes);
  new DataView(result.buffer).setUint32(bytes.length, crc32(bytes));
  return result;
}

export function checksumMatches(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const payload = bytes.subarray(0, bytes.length - 4);
  const expected = new DataView(
    bytes.buffer,
    bytes.byteOffset + bytes.length - 4,
    4,
  ).getUint32(0);
  return crc32(payload) === expected;
}
