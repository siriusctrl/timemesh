# TimeMesh Token Protocol v1

## Contents

1. Goals and limits
2. Common encoding
3. Base payload
4. Participant payload
5. Canonical bitmaps
6. Validation
7. Time semantics
8. Composition and privacy

## 1. Goals and limits

Token v1 is a deterministic, reversible, URL-safe encoding for a bounded availability frame.

- Base prefix: `tm1b_`
- Participant prefix: `tm1p_`
- Slot sizes: 15, 30, or 60 minutes
- Default slot size: 15 minutes
- Maximum window: 31 organizer-local calendar days
- Availability values: one bit per slot
- Integer byte order: big-endian

The prefix carries protocol version and payload kind. A v1 decoder must reject unknown prefixes instead of guessing.

## 2. Common encoding

1. Build the kind-specific binary payload.
2. Calculate IEEE CRC32 over that payload.
3. Append the checksum as one unsigned 32-bit big-endian integer.
4. Encode the result as unpadded Base64URL.
5. Prepend the kind prefix.

Canonical Base64URL uses `A-Z`, `a-z`, `0-9`, `-`, and `_`. Padding is omitted.

CRC32 detects accidental corruption. It is not authentication and does not make a token secret.

## 3. Base payload

```text
Offset  Size  Field
0       1     slotMinutes as literal 15, 30, or 60
1       2     meetingMinutes, unsigned 16-bit
3       4     startEpochMinutes, unsigned 32-bit
7       2     slotCount, unsigned 16-bit
9       1     timezoneByteLength, unsigned 8-bit
10      n     UTF-8 IANA time-zone identifier
10+n    m     organizer-unavailable bitmap
```

The bitmap byte length is `ceil(slotCount / 8)`. The checksum follows the payload and is not included in the offsets above.

## 4. Participant payload

```text
Offset  Size  Field
0       8     baseRef
8       m     participant-free bitmap
```

`baseRef` is the first eight bytes of SHA-256 over the complete canonical base token text, including `tm1b_` and its encoded checksum.

The participant bitmap length must equal `ceil(base.slotCount / 8)`. It has no date window, time zone, meeting duration, or organizer bitmap. A participant token needs the exact base token for full decoding.

## 5. Canonical bitmaps

Slot index zero is the first absolute slot. Within each byte, lower slot indices use less-significant bits:

```text
byte 0 bit 0 -> slot 0
byte 0 bit 1 -> slot 1
...
byte 0 bit 7 -> slot 7
byte 1 bit 0 -> slot 8
```

In a base bitmap, `1` means organizer unavailable. In a participant bitmap, `1` means participant free.

Unused high bits in the last byte must be zero. A decoder must reject nonzero unused bits.

## 6. Validation

A conforming decoder must reject:

- an unknown or wrong prefix;
- noncanonical Base64URL characters;
- a checksum mismatch;
- missing or trailing payload bytes;
- an unsupported slot size;
- a meeting duration outside 15-240 minutes or not aligned to the slot size;
- zero slots or more than 2,984 slots;
- an invalid UTF-8 or unknown IANA time zone;
- nonzero unused bitmap bits;
- a participant bitmap with the wrong length;
- a participant `baseRef` that does not match the supplied base.

Duplicate participant tokens should be de-duplicated by complete token text before planning.

## 7. Time semantics

The organizer chooses a local start date and number of local calendar days. The encoder:

1. Creates organizer-local midnight in the IANA time zone.
2. Adds the requested number of local calendar days to find the end.
3. Stores the start as whole UTC epoch minutes.
4. Stores elapsed absolute slots between start and end.

A daylight-saving transition can make a local day contain 23 or 25 hours. Slot count therefore describes the absolute frame and must not be reconstructed as `days * 24 * 60 / slotMinutes`.

All intervals are half-open: start is included and end is excluded.

## 8. Composition and privacy

A planning bundle is whitespace-separated text with one base first and zero or more matching participants after it:

```text
tm1b_...
tm1p_...
tm1p_...
```

The bundle is transport text, not another Token v1 payload.

Plain tokens disclose their encoded availability to anyone who receives them. A URL path sends the token to the static host as part of the HTTP request. A URL fragment does not. Token v1 provides portability and corruption detection, not encryption, access control, revocation, or identity.
