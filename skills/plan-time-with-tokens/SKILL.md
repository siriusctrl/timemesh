---
name: plan-time-with-tokens
description: Create, answer, revise, decode, validate, and compare TimeMesh meetings entirely through local tm2b_ and tm2p_ tokens. Use when an agent receives a TimeMesh base or response bundle, needs to turn natural-language availability into a validated response, explain organizer conflicts, create a meeting token, or rank shared meeting windows with optional organizer preferences.
---

# Plan Time with Tokens

Use the bundled deterministic tool for every token operation. Never hand-encode, repair, or shorten a binary payload.

## Resources

- Run `node scripts/time-token.mjs` from this Skill directory for generation, decoding, validation, and comparison. It is self-contained and only requires Node.js 22 or newer.
- Read `references/protocol-v2.md` only to review an integration, diagnose a rejected token, or implement a compatible codec.

If only this Markdown file was pasted, download the complete portable package from `https://siriusctrl.github.io/timemesh/plan-time-with-tokens.zip` before running commands. Keep calendar data local.

## Start from the tokens

Extract every `tm2b_...` and `tm2p_...` value from the user's message before asking questions.

- With no base token, help create a meeting.
- With one base and zero or one response, help create or revise that response.
- With one base and multiple responses, validate the bundle and rank shared windows.
- Reject multiple bases, participant tokens without their exact base, and mismatched participant tokens.

Decode the base first. Tell the user its date window, organizer time zone, slot size, meeting duration, and organizer-unavailable ranges in a useful display time zone. If the user's time zone is missing and cannot be inferred safely, ask for it before interpreting phrases such as “Tuesday afternoon.”

## Create a meeting

1. Establish the organizer's start date, window length, IANA time zone, meeting duration, and unavailable time. Default to 14 days, 15-minute slots, and 60 minutes only when the user has not specified them.
2. Keep the window at 31 organizer-local calendar days or fewer. Use an IANA zone such as `Asia/Shanghai`, never a fixed offset such as `UTC+8`.
3. Convert organizer conflicts into explicit ranges and run the base command below.
4. Decode the result and compare it with the requested window and conflicts before returning it.

## Answer or revise a meeting

1. Decode the supplied base. If a response token is also supplied, decode it and treat its free ranges as the editable starting point.
2. Ask for or interpret the participant's free time in their time zone. Confirm ambiguous dates, overnight ranges, and phrases whose boundaries would materially change the result.
3. Convert the intended availability into explicit ranges and run the participant command below.
4. Read `organizerConflictRanges` from the command summary. Those intervals were requested by the participant but are blocked by the organizer and are excluded from the generated response.
5. Tell the user about any conflicts in plain language. Offer to add alternative times or regenerate after an adjustment; do not silently describe conflicting time as part of the response.
6. Decode and validate the response. Return a complete two-line bundle with the exact base first and the new response second. The `tm2p_` token alone is not a complete handoff.

The user can paste that bundle into TimeMesh to review and edit the response. After an edit, TimeMesh generates a replacement response token while keeping the same base context.

## Calendar data

- Ask before reading a local or connected calendar unless the user already authorized access.
- Extract only free/busy facts. Exclude titles, attendees, locations, and notes.
- Treat starts as inclusive and ends as exclusive.
- Give every range boundary an offset or bracketed IANA zone, for example `2026-09-02T09:00+08:00[Asia/Shanghai]`.
- Organizer ranges mean unavailable; every overlapping slot is blocked.
- Participant ranges mean free; only fully contained slots are selected.

Write temporary input as a JSON object with a `ranges` array, then run the bundled deterministic command from this Skill directory.

```sh
node scripts/time-token.mjs base --start YYYY-MM-DD --days 14 --timezone Area/City --meeting 60 --unavailable-json /absolute/path/unavailable.json
```

```sh
node scripts/time-token.mjs participant --base 'tm2b_...' --free-json /absolute/path/free.json --output bundle
```

Validate and decode every result.

```sh
node scripts/time-token.mjs validate 'tm2b_...'
node scripts/time-token.mjs decode 'tm2b_...'
node scripts/time-token.mjs validate 'tm2p_...' --base 'tm2b_...'
node scripts/time-token.mjs decode 'tm2p_...' --base 'tm2b_...'
```

Compare decoded ranges with the intended schedule. On any mismatch, fix the range input and regenerate; never edit the token.

## Compare collected responses

Put the collected response bundles in one text file. Repeated copies of the same base are normalized; distinct bases and mismatched responses are rejected. Run:

```sh
node scripts/time-token.mjs compare --bundle-file /absolute/path/bundles.txt --timezone Area/City
```

The JSON result lists ranked continuous windows, attendance counts, and the response numbers available for each one. Default ranking is transparent: organizer availability is required, more participants ranks first, and earlier times break remaining ties.

Organizer preferences are optional. They belong in a separate JSON file so they do not alter canonical tokens:

```json
{
  "minimumAttendees": 3,
  "allowedRanges": [
    { "start": "2026-09-02T08:00+08:00[Asia/Shanghai]", "end": "2026-09-02T20:00+08:00[Asia/Shanghai]" }
  ],
  "preferredRanges": [
    { "start": "2026-09-02T10:00+08:00[Asia/Shanghai]", "end": "2026-09-02T12:00+08:00[Asia/Shanghai]" }
  ]
}
```

```sh
node scripts/time-token.mjs compare --bundle-file /absolute/path/bundles.txt --preferences-json /absolute/path/preferences.json --timezone Area/City
```

`allowedRanges` and `minimumAttendees` are hard constraints. `preferredRanges` only breaks ties between windows with equal attendance; it never silently ranks fewer available people above more available people. Show the user the top candidates and scoring fields, then let the organizer choose. Do not claim that the first candidate captures preferences that were not supplied.

## Handoff

- For a meeting, put the complete `tm2b_` token on its own line.
- For a response, put the unchanged `tm2b_` base on one line and the new `tm2p_` response on the next line.
- State the date window, display time zone, slot size, selected-slot count, conflict count, and validation result.
- Do not expose calendar event details.
- Mention the TimeMesh app only as an optional interactive review and editing surface; the local workflow must already be complete.

## Planning discipline

Normalize to one distinct base and its unique participant tokens. Participant identity and labels remain outside canonical tokens, so comparison results refer to responses by their one-based order. A single response remains editable; two or more responses form a comparison bundle.
