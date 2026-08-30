# TimeMesh

TimeMesh exchanges availability and finds shared meeting times with portable tokens. It has no accounts, database, API, or synchronization service: the static app edits, validates, and compares data carried by the tokens themselves.

**Public app:** <https://siriusctrl.github.io/timemesh/>

## How it works

### Create a meeting

1. Choose a date window, organizer time zone, grid size, and meeting duration. The default window is 14 days and the maximum is 31 local calendar days.
2. Mark organizer conflicts. The weekday-hours shortcut is editable and defaults to 08:00–20:00; applying it keeps those weekday hours open and blocks the rest.
3. Select **Generate token**, then copy the token itself or use **Copy URL**. The URL contains the `tm2b_...` meeting token in its fragment.

Time-zone fields accept canonical IANA names and major-city searches such as San Francisco or Miami. Tokens always store the canonical IANA zone.

### Respond

1. Open the meeting URL. TimeMesh reconstructs the same absolute slots in your display time zone.
2. Mark every free slot, or edit and apply the weekday-hours shortcut.
3. Select **Generate response**, then **Copy URL**, and send that URL back to the organizer.

The response URL contains both the meeting token and its dependent `tm2p_...` response token. Opening it goes directly to comparison; no response is sent or stored automatically.

### Compare responses

Open a response URL, or paste one meeting token followed by one or more response tokens:

```text
tm2b_...
tm2p_...
tm2p_...
```

TimeMesh validates each response against the meeting, displays an overlap heatmap, and ranks continuous windows long enough for the configured meeting duration.

## Product boundaries

- `tm2b_` stores the absolute frame, grid and meeting duration, organizer IANA time zone, and compressed organizer-unavailable bitmap.
- `tm2p_` stores a base fingerprint, slot count, and compressed participant-free bitmap. It is valid only with the exact meeting token used to create it.
- Tokens are deterministic, reversible, and protected against accidental corruption by a checksum. They are not encrypted or access-controlled.
- Calendar selections, imported tokens, and comparison results stay in browser memory. Only an explicit light/dark override is stored locally; otherwise the interface follows the system theme. Manual switches use a motion-aware radial reveal.
- The app is a static Vite build under `/timemesh/` and has no runtime network dependency.
- Agents use the checked-in CLI for encoding and round-trip validation instead of reproducing binary encoding manually.

## URL forms

```text
https://siriusctrl.github.io/timemesh/t/<meeting-token>
https://siriusctrl.github.io/timemesh/#/<meeting-token>
https://siriusctrl.github.io/timemesh/#/<meeting-token>/<response-token>
```

The path form sends its token to the static host as part of the HTTP request. **Copy URL** uses fragments, which stay out of that request but can still be retained by browser history, chat history, clipboard managers, screenshots, and recipients. A fragment is request-private, not secret.

## Repository map

```text
timemesh/
├── src/protocol/                  # canonical codec, time frame, bitsets, planner
├── src/calendar/                  # cross-zone and DST-safe calendar row layout
├── src/timezones/                 # IANA catalog and major-city search
├── src/components/                # focused product surfaces
├── src/App.tsx                    # browser-local workflow coordinator
├── src/useTheme.ts                # system theme state and manual override
├── skills/plan-time-with-tokens/ # agent workflow, CLI, protocol reference
├── docs/                          # durable architecture decisions
├── tests/                         # protocol, planner, and browser behavior
└── scripts/                       # skill and visual verification
```

`src/protocol/codec.ts` is the only maintained Token v2 codec. The web app and skill CLI both import it.

## Local development

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

## Token CLI

Create a meeting token from explicit unavailable ranges:

```sh
npm run token -- base \
  --start 2026-09-01 \
  --days 14 \
  --timezone Asia/Shanghai \
  --meeting 60 \
  --unavailable-json availability/unavailable.json
```

Create a response token:

```sh
npm run token -- participant \
  --base 'tm2b_...' \
  --free-json availability/free.json
```

Range files use inclusive starts and exclusive ends. Each boundary must include an offset or bracketed IANA zone:

```json
{
  "ranges": [
    {
      "start": "2026-09-02T09:00+08:00[Asia/Shanghai]",
      "end": "2026-09-02T12:00+08:00[Asia/Shanghai]"
    }
  ]
}
```

Validate or inspect tokens:

```sh
npm run token -- validate 'tm2b_...'
npm run token -- decode 'tm2b_...'
npm run token -- validate 'tm2p_...' --base 'tm2b_...'
npm run token -- decode 'tm2p_...' --base 'tm2b_...'
```

Generation writes the token to stdout and a readable summary to stderr.

## Verification

```sh
npm run check
npm run skill:check
npm run verify:ui
npm run verify:proof
```

`verify:proof` writes ignored screenshots and a contact sheet under `artifacts/verification/`.

See [architecture decisions](docs/architecture-decisions.md), the [Agent Skill](skills/plan-time-with-tokens/SKILL.md), and the [Token v2 protocol](skills/plan-time-with-tokens/references/protocol-v2.md).
