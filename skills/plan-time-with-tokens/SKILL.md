---
name: plan-time-with-tokens
description: Generate, decode, validate, and combine TimeMesh tm2b_ base tokens and tm2p_ participant availability tokens from natural-language schedules, calendar exports, or explicit time ranges. Use when an agent must turn organizer constraints or participant free time into a deterministic backend-free token, verify a TimeMesh token, explain its dates in an IANA time zone, or find shared meeting windows from one base plus multiple responses.
---

# Plan Time with Tokens

Use the repository codec for every token operation. Never hand-encode or repair binary payloads.

## Required resources

- Use `scripts/time-token.ts` for generation, decoding, and validation.
- Read `references/protocol-v2.md` only when reviewing an integration, debugging a rejected token, or implementing another compatible codec.

If this skill was pasted without its repository, clone `https://github.com/siriusctrl/timemesh.git` into a temporary directory and run `npm ci` there. Do not send calendar data to a remote service.

## Workflow

1. Identify the requested token kind.
   - Create `tm2b_` for an organizer's frame and unavailable time.
   - Create `tm2p_` for a participant's free time against an existing base.
   - Validate or decode when the user supplies tokens.
   - Plan when the user supplies one base followed by participant tokens.

2. Establish the time facts.
   - Keep the default slot size at 15 minutes unless the user requests 30 or 60.
   - Keep the date window at 31 local days or fewer.
   - Require one IANA time zone such as `Asia/Shanghai`; do not accept `UTC+8` as identity.
   - Ask before reading a local or connected calendar unless the user already authorized it.
   - Extract only free/busy facts. Do not put event titles, attendees, locations, or notes into token input.

3. Create explicit ranges.
   - Write a temporary JSON object with a `ranges` array.
   - Use inclusive start and exclusive end.
   - Give every boundary an offset or bracketed IANA time zone, for example `2026-09-02T09:00+08:00[Asia/Shanghai]`.
   - For organizer input, ranges mean unavailable and any overlapping slot is blocked.
   - For participant input, ranges mean free and only fully contained slots are selected.

4. Run the deterministic command from the TimeMesh repository root.

```sh
npm run token -- base --start YYYY-MM-DD --days 14 --timezone Area/City --meeting 60 --unavailable-json /absolute/path/unavailable.json
```

```sh
npm run token -- participant --base 'tm2b_...' --free-json /absolute/path/free.json
```

5. Verify the result before returning it.

```sh
npm run token -- validate 'tm2b_...'
npm run token -- decode 'tm2b_...'
npm run token -- validate 'tm2p_...' --base 'tm2b_...'
npm run token -- decode 'tm2p_...' --base 'tm2b_...'
```

Compare the decoded range summary with the source schedule. Treat any mismatch as a failed generation and fix the range input rather than editing the token.

6. Return a compact handoff.
   - Put the complete token on its own line.
   - State token kind, date window, time zone, slot size, selected-slot count, and validation result.
   - For participant output, state that the token is bound to the supplied base and does not repeat organizer availability.
   - Do not print private calendar event details.

## Planning discipline

Place the base first and participants after it. Reject any participant whose base fingerprint does not match. Do not infer participant identity from token order or availability. Labels may be kept outside canonical tokens for the current session only.
