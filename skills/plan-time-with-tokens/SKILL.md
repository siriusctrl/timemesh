---
name: plan-time-with-tokens
description: Create, answer, revise, decode, and validate TimeMesh meetings entirely through local tm2b_ and tm2p_ tokens. Use when an agent receives a TimeMesh base or response bundle, needs to turn natural-language availability into a validated response, explain organizer conflicts, create a meeting token, or prepare a complete bundle for interactive review or comparison.
---

# Plan Time with Tokens

Use the repository codec for every token operation. Never hand-encode, repair, or shorten a binary payload.

## Resources

- Run `scripts/time-token.ts` for generation, decoding, and validation.
- Read `references/protocol-v2.md` only to review an integration, diagnose a rejected token, or implement a compatible codec.

If the repository is unavailable, clone `https://github.com/siriusctrl/timemesh.git` into a temporary directory and run `npm ci`. Keep calendar data local.

## Start from the tokens

Extract every `tm2b_...` and `tm2p_...` value from the user's message before asking questions.

- With no base token, help create a meeting.
- With one base and zero or one response, help create or revise that response.
- With one base and multiple responses, validate the bundle and summarize shared windows.
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

Write temporary input as a JSON object with a `ranges` array, then run the deterministic command from the TimeMesh repository root.

```sh
npm run token -- base --start YYYY-MM-DD --days 14 --timezone Area/City --meeting 60 --unavailable-json /absolute/path/unavailable.json
```

```sh
npm run token -- participant --base 'tm2b_...' --free-json /absolute/path/free.json
```

Validate and decode every result.

```sh
npm run token -- validate 'tm2b_...'
npm run token -- decode 'tm2b_...'
npm run token -- validate 'tm2p_...' --base 'tm2b_...'
npm run token -- decode 'tm2p_...' --base 'tm2b_...'
```

Compare decoded ranges with the intended schedule. On any mismatch, fix the range input and regenerate; never edit the token.

## Handoff

- For a meeting, put the complete `tm2b_` token on its own line.
- For a response, put the unchanged `tm2b_` base on one line and the new `tm2p_` response on the next line.
- State the date window, display time zone, slot size, selected-slot count, conflict count, and validation result.
- Do not expose calendar event details.
- Mention the TimeMesh app only as an optional interactive review and editing surface; the local workflow must already be complete.

## Planning discipline

Put exactly one base first and its participant tokens after it. De-duplicate identical participant tokens. Participant identity and labels remain outside canonical tokens. A single response remains editable; two or more responses form a comparison bundle.
