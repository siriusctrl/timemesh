# TimeMesh Token Protocol v2

## Contents

1. Goals and limits
2. Common encoding
3. Canonical bitmap encoding
4. Base payload
5. Participant payload
6. Validation
7. Time semantics
8. Composition and privacy

## 1. Goals and limits

Token v2 is a deterministic, reversible, URL-safe encoding for a bounded availability frame.

- Base prefix: `tm2b_`
- Participant prefix: `tm2p_`
- Slot sizes: 15, 30, or 60 minutes
- Default slot size: 15 minutes
- Maximum window: 31 organizer-local calendar days
- Availability values: one bit per slot before canonical compression
- Integer byte order: big-endian

The prefix carries protocol version and payload kind. A v2 decoder rejects unknown prefixes.

## 2. Common encoding

1. Build the kind-specific binary payload.
2. Calculate IEEE CRC32 over that payload.
3. Append the checksum as one unsigned 32-bit big-endian integer.
4. Encode the result as unpadded Base64URL.
5. Prepend the kind prefix.

Canonical Base64URL uses `A-Z`, `a-z`, `0-9`, `-`, and `_`. Padding is omitted. CRC32 detects accidental corruption; it is not authentication.

## 3. Canonical bitmap encoding

The decoded bitmap always uses least-significant-bit-first slot order:

```text
byte 0 bit 0 -> slot 0
byte 0 bit 1 -> slot 1
...
byte 1 bit 0 -> slot 8
```

The token stores one encoding-mode byte followed by mode-specific bytes:

```text
Mode  Meaning
0     raw canonical bitmap bytes
1     alternating run lengths beginning with zero
2     alternating run lengths beginning with one
```

Modes 1 and 2 encode every positive run length as unsigned LEB128. Runs alternate bit value and must consume exactly `slotCount` bits. Zero-length runs and trailing bytes are invalid.

The canonical encoder compares raw mode with run-length mode. It uses run-length mode only when it is strictly shorter; raw mode wins a tie. A decoder must decode and re-encode the bitmap, rejecting any byte sequence that is not the canonical shortest representation. Unused high bits in the final raw bitmap byte must be zero.

## 4. Base payload

```text
Offset  Size  Field
0       1     slotMinutes as literal 15, 30, or 60
1       2     meetingMinutes, unsigned 16-bit
3       4     startEpochMinutes, unsigned 32-bit
7       2     slotCount, unsigned 16-bit
9       1     timezoneByteLength, unsigned 8-bit
10      n     UTF-8 IANA time-zone identifier
10+n    m     canonical encoded organizer-unavailable bitmap
```

In the decoded base bitmap, `1` means organizer unavailable. The checksum follows the payload and is not included in the offsets above.

## 5. Participant payload

```text
Offset  Size  Field
0       8     baseRef
8       2     slotCount, unsigned 16-bit
10      m     canonical encoded participant-free bitmap
```

`baseRef` is the first eight bytes of SHA-256 over the complete canonical base token text, including `tm2b_` and its checksum. In the decoded participant bitmap, `1` means participant free.

The participant repeats only the slot count needed to decode its compressed bitmap. It does not repeat the base window, time zone, meeting duration, or organizer availability. Full validation requires the exact base token.

## 6. Validation

A conforming decoder rejects:

- an unknown or wrong prefix;
- noncanonical Base64URL characters;
- a checksum mismatch;
- missing or trailing payload bytes;
- an unsupported slot size;
- a meeting duration outside 15-240 minutes or not aligned to the slot size;
- zero slots or more than 2,984 slots;
- invalid UTF-8 or an unknown IANA time zone;
- an unknown bitmap mode, malformed LEB128, zero-length run, run overflow, or noncanonical bitmap representation;
- nonzero unused bitmap bits;
- a participant slot count that differs from its base;
- a participant `baseRef` that does not match the supplied base.

Duplicate participant tokens should be de-duplicated by complete token text before planning.

## 7. Time semantics

The organizer chooses a local start date and number of local calendar days. The encoder:

1. Creates organizer-local midnight in the IANA time zone.
2. Adds the requested number of local calendar days to find the end.
3. Stores the start as whole UTC epoch minutes.
4. Stores elapsed absolute slots between start and end.

A daylight-saving transition can make a local day contain 23 or 25 hours. Slot count therefore describes the absolute frame and must not be reconstructed as `days * 24 * 60 / slotMinutes`. All intervals are half-open: start is included and end is excluded.

## 8. Composition and privacy

A planning bundle is whitespace-separated text with one base first and zero or more matching participants:

```text
tm2b_...
tm2p_...
tm2p_...
```

The bundle is transport text, not another Token v2 payload.

Plain tokens disclose their encoded availability to anyone who receives them. A URL path sends the token to the static host as part of the HTTP request. A URL fragment does not. Token v2 provides portability and corruption detection, not encryption, access control, revocation, or identity.
