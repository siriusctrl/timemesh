---
name: plan-time-with-tokens
description: Generate, decode, and validate TimeMesh tm2b_ meeting tokens and tm2p_ participant response tokens from schedules or explicit time ranges. Use when an agent must encode organizer constraints or participant free time, inspect a TimeMesh token in an IANA time zone, or prepare a validated token bundle for comparison in TimeMesh.
---

# Plan Time with Tokens

Use the repository codec for every token operation. Never hand-encode, repair, or shorten a binary payload.

## Resources

- Run `scripts/time-token.ts` for generation, decoding, and validation.
- Read `references/protocol-v2.md` only to review an integration, diagnose a rejected token, or implement a compatible codec.

If the repository is unavailable, clone `https://github.com/siriusctrl/timemesh.git` into a temporary directory and run `npm ci`. Keep calendar data local.

## Workflow

1. Choose the operation.
   - Create `tm2b_` for a meeting frame and organizer-unavailable time.
   - Create `tm2p_` for participant-free time against an existing base.
   - Decode or validate supplied tokens.
   - Prepare one base followed by matching participant tokens for comparison in the TimeMesh app.

2. Establish time facts.
   - Default to 15-minute slots; supported alternatives are 30 and 60 minutes.
   - Keep the window at 31 organizer-local calendar days or fewer.
   - Use an IANA zone such as `Asia/Shanghai`, not a fixed offset such as `UTC+8`.
   - Ask before reading a local or connected calendar unless the user already authorized access.
   - Extract only free/busy facts. Exclude titles, attendees, locations, and notes.

3. Write a temporary JSON object with a `ranges` array.
   - Treat starts as inclusive and ends as exclusive.
   - Give every boundary an offset or bracketed IANA zone, for example `2026-09-02T09:00+08:00[Asia/Shanghai]`.
   - Organizer ranges mean unavailable; every overlapping slot is blocked.
   - Participant ranges mean free; only fully contained slots are selected.

4. Run the deterministic command from the TimeMesh repository root.

```sh
npm run token -- base --start YYYY-MM-DD --days 14 --timezone Area/City --meeting 60 --unavailable-json /absolute/path/unavailable.json
```

```sh
npm run token -- participant --base 'tm2b_...' --free-json /absolute/path/free.json
```

5. Validate and decode the result.

```sh
npm run token -- validate 'tm2b_...'
npm run token -- decode 'tm2b_...'
npm run token -- validate 'tm2p_...' --base 'tm2b_...'
npm run token -- decode 'tm2p_...' --base 'tm2b_...'
```

Compare decoded ranges with the source schedule. On any mismatch, fix the range input and regenerate; never edit the token.

6. Return a compact handoff.
   - Put the complete token on its own line.
   - State its kind, date window, time zone, slot size, selected-slot count, and validation result.
   - For a response, state that it is bound to the supplied base.
   - Do not expose calendar event details.

## Planning discipline

Put exactly one base first and its participant tokens after it. Reject mismatched bases and de-duplicate identical participant tokens. Participant identity and labels remain outside canonical tokens.
