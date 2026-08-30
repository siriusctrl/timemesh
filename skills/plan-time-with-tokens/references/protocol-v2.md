# TimeMesh Token Protocol v2

## 1. Scope

Token v2 is a deterministic, reversible, URL-safe encoding for a bounded availability frame.

- Base prefix: `tm2b_`
- Participant prefix: `tm2p_`
- Slot sizes: 15, 30, or 60 minutes
- Default slot size: 15 minutes
- Maximum window: 31 organizer-local calendar days
- Availability: one bit per slot before compression
- Integer byte order: big-endian

The prefix identifies the protocol version and payload kind. A v2 decoder rejects unknown prefixes.

## 2. Common encoding

1. Build the kind-specific binary payload.
2. Calculate IEEE CRC32 over the payload.
3. Append the checksum as an unsigned 32-bit big-endian integer.
4. Encode the result as unpadded Base64URL.
5. Prepend the kind prefix.

Canonical Base64URL uses `A-Z`, `a-z`, `0-9`, `-`, and `_` without padding. CRC32 detects accidental corruption; it does not authenticate data.

## 3. Canonical bitmap encoding

Decoded bitmaps use least-significant-bit-first slot order:

```text
byte 0 bit 0 -> slot 0
byte 0 bit 1 -> slot 1
...
byte 1 bit 0 -> slot 8
```

The encoded bitmap begins with one mode byte:

```text
Mode  Following bytes
0     Raw canonical bitmap
1     Alternating run lengths beginning with zero
2     Alternating run lengths beginning with one
```

Modes 1 and 2 store each positive run length as unsigned LEB128. Runs alternate bit value and must consume exactly `slotCount` bits. Zero-length runs and trailing bytes are invalid.

The encoder uses run lengths only when they are strictly shorter than raw mode; raw wins a tie. A decoder must decode and re-encode the bitmap, rejecting any noncanonical representation. Unused high bits in the final raw byte must be zero.

## 4. Base payload

```text
Offset  Size  Field
0       1     slotMinutes: literal 15, 30, or 60
1       2     meetingMinutes: unsigned 16-bit
3       4     startEpochMinutes: unsigned 32-bit
7       2     slotCount: unsigned 16-bit
9       1     timezoneByteLength: unsigned 8-bit
10      n     UTF-8 IANA time-zone identifier
10+n    m     canonical organizer-unavailable bitmap
```

In the decoded bitmap, `1` means organizer unavailable. The checksum follows the payload and is excluded from the offsets above.

## 5. Participant payload

```text
Offset  Size  Field
0       8     baseRef
8       2     slotCount: unsigned 16-bit
10      m     canonical participant-free bitmap
```

`baseRef` is the first eight SHA-256 bytes of the complete canonical base token text, including the `tm2b_` prefix and checksum. In the decoded bitmap, `1` means participant free.

The participant repeats only the slot count needed to decode its bitmap. It does not repeat the frame, time zone, meeting duration, or organizer constraints. Full validation requires the exact base token.

## 6. Validation

A conforming decoder rejects:

- an unknown or wrong prefix;
- noncanonical Base64URL;
- a checksum mismatch;
- missing or trailing payload bytes;
- an unsupported slot size;
- a meeting duration outside 15–240 minutes or not aligned to the slot size;
- zero slots or more than 2,984 slots;
- invalid UTF-8 or an unknown IANA time zone;
- an unknown bitmap mode, malformed LEB128, zero-length run, overflow, or noncanonical bitmap representation;
- nonzero unused bitmap bits;
- a participant slot count that differs from its base;
- a participant `baseRef` that does not match the supplied base.

Planning should de-duplicate identical participant token text.

## 7. Time semantics

The organizer chooses a local start date and number of local calendar days. The encoder:

1. Creates local midnight in the organizer IANA zone.
2. Adds the selected number of local calendar days.
3. Stores the start as whole UTC epoch minutes.
4. Stores the elapsed absolute slot count.

A daylight-saving transition can produce a 23- or 25-hour local day. Never reconstruct slot count as `days * 24 * 60 / slotMinutes`. All intervals are half-open: start included, end excluded.

## 8. Composition and privacy

A token bundle is whitespace-separated transport text, not another Token v2 payload:

```text
tm2b_...
tm2p_...
tm2p_...
```

Anyone holding a plain token can decode its availability. URL paths send tokens to the static host in the HTTP request; URL fragments do not. Token v2 provides portability and corruption detection, not encryption, access control, revocation, or identity.
