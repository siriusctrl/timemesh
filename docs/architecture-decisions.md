# Architecture decisions

## 1. The token is the product boundary

TimeMesh does not model invitations, accounts, sessions, or remote responses. A base token establishes a time coordinate system. Participant tokens express free slots relative to the exact base. The browser composes these values locally.

This keeps the static hosting boundary honest and lets tokens travel through chat, files, QR codes, URLs, or agent output without selecting a messaging backend.

## 2. Reversible tokens are not hashes

The complete token is a canonical reversible encoding. A checksum detects accidental damage, while SHA-256 is used only to bind a participant token to its base.

Different canonical allocations produce different token payloads. Equal allocations produce equal tokens. TimeMesh does not add random session IDs to canonical data.

## 3. Base and participant data stay separate

A `tm2b_` token contains:

- slot size and meeting duration;
- absolute start as UTC epoch minutes;
- absolute slot count;
- organizer IANA time zone;
- organizer-unavailable bitmap encoded as raw bytes or bit-run lengths, whichever is shorter;
- CRC32 checksum.

A `tm2p_` token contains:

- the first eight bytes of SHA-256 over the complete base token;
- slot count and a compressed participant-free bitmap;
- CRC32 checksum.

It does not duplicate the base window, time zone, meeting duration, or organizer availability. A participant token therefore needs its base to recover real dates. Editing a base intentionally invalidates prior responses.

## 4. Absolute slots preserve cross-zone meaning

The frame starts at the organizer's local start-of-day but is stored as an absolute instant. The end is calculated by adding local calendar days in the organizer's IANA time zone. Slot count is the elapsed absolute duration divided by the selected slot size.

This means a 14-day window that crosses a daylight-saving transition can contain 1,340 or 1,348 fifteen-minute slots rather than always containing 1,344. Every participant still refers to the same instants.

TimeMesh does not store a fixed UTC offset as time-zone identity. It uses IANA names such as `Asia/Shanghai` and `America/New_York`.

## 5. Token v2 is compressed and intentionally bounded

Token v2 supports:

- 1-31 local calendar days;
- 15, 30, or 60-minute slots;
- 15-240-minute meeting durations aligned to the slot size;
- one bit per slot for organizer unavailability or participant availability;
- one base and any number of matching participants in a planning bundle.

Each bitmap chooses between raw bytes and alternating bit-run lengths. The shorter representation is canonical; raw wins ties. This turns common empty or work-hour schedules into short tokens without making irregular bitmaps larger. A decoder re-encodes the decoded bitmap and rejects any longer equivalent spelling.

The bounded window keeps tokens URL-sized and the local planner responsive. Recurring rules and arbitrary historical ranges are separate future protocol problems.

## 6. The Agent Skill calls the canonical codec

Natural-language interpretation and calendar access vary by agent. Binary encoding must not vary. The Skill therefore asks the agent to create explicit absolute time ranges, call the checked-in CLI, and decode the result for comparison.

The CLI and frontend both import `src/protocol/codec.ts`. The protocol reference exists for review and independent implementations, not as permission for an agent to improvise bytes.

## 7. GitHub Pages hosts code, not planning state

The Vite build uses `/timemesh/` and GitHub Pages serves only static assets. A custom `404.html` restores pretty deep routes.

Token URLs support both single-token meetings and self-contained response handoffs:

- `/timemesh/t/<token>` is readable but the path reaches GitHub's hosting infrastructure.
- `/timemesh/#/<base-token>` opens the participant response view.
- `/timemesh/#/<base-token>/<participant-token>` opens the organizer comparison view with that response loaded.

The UI calls this action **Copy URL**, not a private URL. Fragments stay out of HTTP requests, but browser history, chat history, clipboard managers, screenshots, and recipients can retain them. Encryption needs a separate protocol version or envelope.

## 8. UI state is disposable

The current token input, decoded allocations, selections, and candidates live in React memory. Reloading without a token clears them. Only the light/dark preference is persisted locally.

This matches the token-first model: users retain data by retaining tokens, not by trusting hidden browser state.
