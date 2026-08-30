# AGENTS.md

This file is the operating map for agents working in this repository. Keep product intent and user workflows in `README.md`, durable trade-offs in `docs/architecture-decisions.md`, agent procedure in the project skill, and this file focused on navigation, invariants, verification, and handoff.

## Source map

- `src/protocol/types.ts`: Token v2 limits, prefixes, domain types, and typed errors.
- `src/protocol/bits.ts`: canonical least-significant-bit-first availability bitmaps.
- `src/protocol/crc32.ts`: token corruption checksum.
- `src/protocol/codec.ts`: the only maintained base and participant binary codec.
- `src/protocol/time.ts`: DST-safe absolute frame creation, IANA-zone display, range mapping, and work-hour presets.
- `src/protocol/planner.ts`: visualization-neutral slot scores and continuous-window ranking.
- `src/components/CalendarGrid.tsx`: drag and keyboard allocation editor plus overlap heatmap.
- `src/App.tsx`: browser-local workflow state and token composition.
- `skills/plan-time-with-tokens/`: reusable agent workflow, deterministic CLI, and Token v2 reference.
- `tests/`: protocol, planner, and Playwright behavior.
- `scripts/record-proof.mjs`: desktop/mobile visual evidence and contact sheet.
- `public/404.html`: GitHub Pages deep-route recovery for `/timemesh/t/<token>`.
- `.github/workflows/pages.yml`: verification and static deployment.

## Core invariants

- Tokens are the source of truth. Do not introduce an invitation, session, user, or server-side identity model.
- `tm2b_` contains the absolute frame and compressed organizer-unavailable bitmap. `tm2p_` contains a truncated SHA-256 base reference, slot count, and compressed participant-free bitmap only.
- Keep Token v2 deterministic and canonical. The same allocation must produce the same bytes, unused bitmap bits must be zero, bitmap encoding must choose the shortest canonical representation, and decoders must reject trailing data.
- Keep the default slot size at 15 minutes and the maximum local date window at 31 days.
- Store the frame as UTC epoch minutes plus slot count. Keep an IANA time zone for calendar boundaries and display. Never use a fixed UTC offset as time-zone identity.
- Keep participant tokens dependent on their exact base token. A base edit invalidates collected participant tokens by design.
- Never make a language model reproduce binary encoding manually. Agents create explicit time ranges and call the project CLI, then decode the result for round-trip verification.
- Keep imported tokens, selections, and planning results in browser memory. Theme preference is the only local-storage value.
- Keep the app statically buildable under `/timemesh/` with no runtime network dependency.
- Treat `/t/<token>` as a convenience route that exposes its path to the host. Generate `#/<token>` as the private URL.
- Planner code consumes decoded protocol objects. UI components must not parse token bytes directly.

## Task routing

- Token field or binary-layout change: update `codec.ts`, the protocol reference, golden tests, CLI output, README, and architecture decisions together. A layout change requires a new prefix/version rather than silent Token v2 drift.
- Time-zone or window change: update `time.ts`, DST tests, protocol limits, and calendar projections together.
- New planner ranking rule: implement it in `planner.ts` before projecting it in a component.
- New agent workflow: update the Skill and deterministic CLI. Keep detailed binary documentation in the protocol reference.
- New URL behavior: inspect `vite.config.ts`, `index.html`, `public/404.html`, and the Pages workflow together.
- UI change: test both themes, desktop/mobile collapse, keyboard selection, empty/error states, and screenshot proof.

## Verification

Run for every protocol or application change:

```sh
npm run check
npm run skill:check
```

Before publishing a UI change, also run:

```sh
npm run verify:ui
npm run verify:proof
```

Inspect `artifacts/verification/contact-sheet.png` and individual screenshots. A successful build does not prove drag selection, horizontal calendar scrolling, token restoration, dark mode, or mobile usability.

For a protocol change, additionally use the CLI to generate, decode, and validate both token kinds. Confirm the current Token v2 golden vectors remain stable or intentionally introduce a new protocol version.

## Documentation and handoff

- Update `README.md` when product behavior, setup, hosting, scope, or verification changes.
- Update `docs/architecture-decisions.md` when token composition, privacy, time semantics, versioning, or hosting boundaries change.
- Update `skills/plan-time-with-tokens/` when agent input, CLI commands, or validation requirements change.
- Do not commit calendar exports, real availability tokens, generated `dist/`, browser artifacts, credentials, or caches.
- Report checks actually run and distinguish protocol fixtures from real user calendar data.
- Use focused Conventional Commit messages.
