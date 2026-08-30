# Architecture decisions

## 1. Tokens are the product boundary

TimeMesh has no invitation, account, session, or remote-response model. A base token defines the meeting frame and organizer constraints; participant tokens express free slots relative to that exact base. The browser and Agent Skill compose them locally.

Tokens can travel through URLs, chat, files, QR codes, or agent output without a messaging backend.

## 2. Tokens are canonical and reversible

A complete token is a deterministic binary encoding, not a hash or random identifier. Equal canonical allocations produce equal tokens. CRC32 detects accidental damage; SHA-256 is used only to bind a participant token to its base.

## 3. Meeting and response data stay separate

A `tm2b_` base token contains:

- slot size and meeting duration;
- absolute start and slot count;
- organizer IANA time zone;
- compressed organizer-unavailable bitmap;
- CRC32 checksum.

A `tm2p_` participant token contains:

- the first eight SHA-256 bytes of the complete base token;
- slot count and compressed participant-free bitmap;
- CRC32 checksum.

It does not repeat the frame, time zone, meeting duration, or organizer constraints. Recovering dates and fully validating a participant token require its exact base. Editing a base intentionally invalidates existing responses.

## 4. Absolute slots preserve cross-zone meaning

The frame starts at organizer-local midnight and ends after the selected number of organizer-local calendar days. The token stores the start as UTC epoch minutes and the frame length as an absolute slot count.

A 14-day window across a daylight-saving transition therefore need not contain exactly 14 × 24 hours. Every participant still refers to the same instants. IANA names such as `Asia/Shanghai` and `America/New_York`, never fixed UTC offsets, define calendar boundaries and display.

## 5. Token v2 uses bounded canonical compression

Token v2 supports:

- 1–31 organizer-local calendar days;
- 15, 30, or 60-minute slots;
- 15–240-minute meeting durations aligned to the slot size;
- one bit per slot for organizer unavailability or participant free time;
- one base plus matching participant tokens in a token bundle.

Each bitmap is stored as raw bytes or alternating bit-run lengths, whichever is strictly shorter; raw wins ties. Decoders re-encode the bitmap and reject longer equivalent representations. The bounded frame keeps tokens portable and browser-local planning responsive.

## 6. Agents call the canonical codec

Natural-language interpretation and calendar access vary by agent; binary encoding must not. Agents create explicit time ranges, call the checked-in CLI, inspect organizer conflicts, then decode the result for round-trip comparison. A participant handoff always includes the unchanged base followed by its dependent response token.

The CLI and frontend both import `src/protocol/codec.ts`. The protocol reference supports review and compatible implementations; it is not a substitute for the CLI in agent workflows.

## 7. GitHub Pages hosts code, not planning state

The Vite build uses `/timemesh/`, and GitHub Pages serves static assets plus a `404.html` deep-route fallback.

- `/timemesh/t/<meeting-token>` opens a meeting through a readable path that reaches the host.
- `/timemesh/#/<meeting-token>` opens a new participant response.
- `/timemesh/#/<meeting-token>/<participant-token>` restores that response for review and editing.
- A base followed by two or more participant tokens opens local comparison.

The UI calls this action **Copy URL**. Fragments stay out of HTTP requests but are not secret, encrypted, revocable, or access-controlled.

## 8. Browser state is disposable

Imported tokens, selections, and planning results live in React memory. Reloading without a token clears them. The app follows the system theme by default; only an explicit theme override is stored in local storage.

The frontend renders a token document rather than separate product objects: a locally created base is editable organizer input, an imported base with zero or one participant token is an editable response, and two or more participant tokens produce comparison. Editing an imported response invalidates only its old participant token; the base remains the response context.
