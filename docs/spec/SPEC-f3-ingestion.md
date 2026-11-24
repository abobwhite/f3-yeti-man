# Spec: F3 Slack ingestion — V1

Module id: `f3-ingestion`. Status: proposed. Depends on: `entry-capture` (and its providers transitively).
Inherits [the common contract](SPEC-common.md).

## Objective

Recognize authentic F3 Nation Preblasts and Backblasts in Slack as reference messages about external workouts, prefill entry candidates, and trigger entry capture in the correct thread without duplicate credit or dependence on posting order. V1 consumes Slack events only; it does not directly query, synchronize with or write to the F3 Nation app or its workout store.

All automated reply paths also enforce [required setup and the Backblast toggle](configuration-contract.md). A suppressed event cannot create an entry draft or send an unsolicited notice. Manual capture is independent of this toggle.

## Trusted-source and parsing requirements

INGEST-01: Listen for supported public channel message events in configured AOs where the bot is a member. Accept only the configured trusted F3 Nation Slack app ID or an explicitly verified per-installation bot identity mapping. The displayed “Side car (via F3 Nation)” name, APP badge, message title and text are not authentication. Do not ignore all bot messages: the required source is another app. Listener/middleware selection must allow the trusted third-party bot and still ignore Yeti Man's own messages.

INGEST-02: Resolve workspace from the signed event and use foundation to check local AO/channel. Reject unconfigured channels, foreign/shared channels, unknown source identities and unsupported message shapes. Only when regional setup is complete and automatic replies are ON, a trusted source posted in an unconfigured `ao-` channel can produce a rate-limited configuration notice, but cannot silently register an AO or award points. No data may be drawn from a different installation when source matching fails.

INGEST-03: Parse deterministically from message text and supported nested Block Kit text/rich-text user elements. Normalize markup, line breaks, whitespace and label capitalization without executing content. Support `<@USER_ID>` mentions and Slack `/team/USER_ID` profile links. Treat narrative fields, URLs and screenshot text as evidence only; do not fetch arbitrary linked sites, execute embedded instructions or interpret workout prose as app commands.

INGEST-04: A Backblast is recognized by the trusted source plus a Backblast heading and labeled workout fields. Extract title, DATE, AO, Q set, PAX set and COUNT if present. AO channel mapping is authoritative over a human-readable AO label; mismatch produces a warning for confirmation. Parse users only from the Q/PAX fields, not mentions anywhere in announcements/COT. Deduplicate IDs and validate them against the local workspace through providers.

INGEST-05: Q may contain multiple users; mention all resolved Qs in the entry-capture thread request. PAX provides candidate attendance for the Yeti Man entry, not a live read of authoritative F3 Nation attendance; Q identity does not authorize or restrict submission. COUNT is a review check, not authority to invent attendance. HC/Preblast commitments never become Backblast attendance. Unresolvable names and FNGs/visitors without workspace Slack accounts stay explicit review warnings, not phantom users. Known PAX can still be saved and credited; unresolved attendees receive no points until their local Slack identity is added through Modify in an unlocked season.

## Preblast time matching

INGEST-06: Store normalized Preblast candidates by tenant, AO, workout local date, title, Q set and message source. Extract `Time: 0530` as `05:30`. The Preblast sample's Date has month/day/weekday but no year. Infer year only when a unique candidate agrees with weekday and the event's actual posting timestamp in the region timezone. Proposed search bound: ±90 days around posting date, considering adjacent years. If ambiguous or outside that bound, keep the date unresolved and use manual confirmation/schedule fallback. Do not infer year from the host date or the date the app processes a delayed job.

INGEST-07: Prefer an explicit workout time in a supported Backblast field. Otherwise match a Preblast with the same tenant, mapped AO and resolved workout date, using normalized title and Q IDs to disambiguate. Exact known Q sets/title strengthen the match; missing fields must not be guessed. Collapse exact duplicate candidates that agree on the same time/source meaning; multiple plausible candidates with different times are ambiguous. Never select by “last Preblast before Backblast,” closest posting time or arbitrary first result.

INGEST-08: If no unambiguous match, use the selected AO's schedule for that date's weekday only when it yields one time. Otherwise leave time for the PAX to choose, with an explanation. All inferred date/time values remain editable. Another workout's newer Preblast must not contaminate the current Backblast. A late-arriving Preblast may refine an untouched pending default with an explicit notice, but never overwrite user-entered draft values or saved record facts.

INGEST-09: Retain the normalized candidates needed to match late Backblasts for open seasons; do not expire them just because a Backblast was posted late or the configured interval ended. Prune raw payloads on a shorter operational policy, keeping source identity and relevant normalized fields. Stop collecting unrelated prose. No broad Slack history scan is required: ingest delivered events, persist necessary candidates, and allow manual completion when history is unavailable. Preblasts for upcoming configured-season workouts may be retained even when posted before that season's start date.

## Capture and idempotency

INGEST-10: After required setup and the current automatic-reply setting are checked, a Backblast with a reliably parsed workout date inside an admin-configured open season calls `requestCapture` with source reference, candidate fields and the Backblast thread destination. Leave temperature empty. Do not award any points until a PAX presses Save. For a reliably out-of-season date, do not post a temperature request. If date/source fields are incomplete, show a compact review/capture entry point rather than fabricating a date and silently crediting it. A locked season receives no editable capture form; an existing entry can be shown read-only.

INGEST-11: Check existing source linkage first. If absent and AO/date/time are unambiguous, find the natural-key record before creating a prompt. If a matching manual entry exists, preserve its saved fields and submitter; attach the new source only if season is open, then show/link the saved summary in the Backblast thread. If time is uncertain, present candidate confirmation rather than creating a likely duplicate record. A locked record can be linked in a read-only message without mutating its source mappings.

INGEST-12: Persist a uniquely keyed event inbox `(teamId, eventId)` plus a tenant/channel/message source key. Repeated Events API deliveries must not produce another draft or ledger write. Message edits share source identity and have monotonic event/source revision checks so older events do not replace newer normalized data. Honor retries/backoff without treating Slack delivery as exactly once. [Slack Events API](https://docs.slack.dev/apis/events-api/)

INGEST-13: Handle trusted `message_changed` shapes by revalidating the nested source identity. Before Save, refresh only untouched defaults or show changed-source review. After Save, preserve user-confirmed data and show a source-changed notice if relevant; require Modify to change points/attendance. A deleted Preblast or Backblast never automatically deletes a confirmed entry. The retained canonical source identity prevents replay from recreating it.

INGEST-14: Recheck current setup and `automaticBackblastRepliesEnabled` at dispatch even for jobs enqueued while ON; suppress unsolicited posts when OFF and do not replay suppressed events on re-enable. Use a durable outbox for thread posts/updates. Retrying a successful-but-response-lost Slack post can create a duplicate presentation message; do not promise distributed exactly-once posting. Use stable operation references and available safe reconciliation before retry, detect uncertain outcomes, and expose repair status. Even if two thread views appear, both must resolve to the same source/draft/entry and cannot yield duplicate credit. Never re-post an unbounded stream of prompts after errors.

INGEST-15: Source and natural-identity matching must include archived entries. A late/retried/edited Backblast matching an archived entry shows or links its Archived summary; it cannot create another active draft/entry, restore the entry, or reinstate points. Keep source identity and deduplication mappings after archive. If the archived entry's season is locked, show it read-only without attaching new provenance. Only a separate explicit authorized admin restoration in an unlocked season can reactivate it.

## Data and integration contracts

Own `eventInbox` and normalized `preblastCandidates`. These are message evidence/cache data, not a local workout catalog. Durable reference-message/entry mappings belong to `entry-ledger` via `entrySources`; actor drafts and message views belong to `entry-capture`. Retain both the triggering Backblast and any matched Preblast provenance so the entry's reference-time origin is inspectable. Store parser version, safe normalized fields, parse confidence/status and source revision. Index tenant/AO/workout-date and tenant/source identity. Do not store raw workout prose unnecessarily.

```text
normalizeF3Message(verifiedMessage) → ParsedPreblast | ParsedBackblast | Unsupported
matchPreblast(context, backblast) → MatchedTime | Ambiguous | NotFound
processF3Event(context, verifiedEvent) → Ignored | CaptureReceipt | ReviewNotice
```

These are internal ingestion interfaces. Capture receives structured candidates, warnings and provenance, never a claim that the data is already validated or saved. Parser failure is isolated to that message and cannot crash the event dispatcher.

INGEST-16: Keep the message parser/matcher behind the candidate/provenance boundary. A future direct F3 Nation adapter may provide verified official-workout references through an approved extension, while this adapter continues to process Slack messages. Do not fabricate an external workout ID, require F3 Nation credentials or embed an undocumented API client in V1. Integrating a future adapter needs confirmed API availability, permission/tenant mapping and conflict policy; receiving a Preblast/Backblast is not direct integration with the official workout store.

## Commands and testing strategy

Future check: `npm run test:module -- f3-ingestion`, then `npm run check`.
Source and tests follow SPEC-common.md. Store sanitized fixtures in `tests/fixtures/f3/` during implementation.

## Success criteria

- INGEST-A1: The supplied Backblast parses a title, 2026-11-20 date, Chuckletown, two Qs, 16 unique PAX and COUNT 16; under the default December–February interval it produces no seasonal temperature request; when an admin-configured interval includes November 20, it can trigger capture if setup is complete and replies are ON. A synthetic in-season variant also exercises the default full prompt path.
- INGEST-A2: The matching supplied Preblast parses 0530 to 05:30 and supplies no attendance, despite its HC list.
- INGEST-A3: Interleaved Preblast A, Preblast B, Backblast A selects A's date/time, not B's. Multiple same-day conflicting matches remain unconfirmed.
- INGEST-A4: Plain text, mrkdwn links, user mentions, supported blocks, multiple Qs, FNGs, mismatched counts and missing/malformed fields are covered.
- INGEST-A5: A spoofed display name/app badge, foreign channel, wrong trusted ID and app's own posts are ignored safely.
- INGEST-A6: Duplicate events, changed/deleted messages, out-of-order delivery, worker restart and uncertain Slack post responses cannot double-count a competition entry.
- INGEST-A7: A late Backblast preserves an existing manual entry; locked seasons cannot be changed through ingestion or provenance attachment.
- INGEST-A8: Archive a manual/source-linked entry, then replay or edit its referenced workout's Backblast or post a matching later one. All paths resolve to the archived entry without a new active form, duplicate entry or points.
- INGEST-A9: Slack references yield entry candidates without calling F3 Nation directly or requiring an official workout ID. Matched Preblast and triggering Backblast provenance remain distinct from the entry and any future external identity.

- INGEST-A10: Default ON, OFF, re-enable, incomplete setup and queued-before-OFF behavior are tested across two regions. Manual entry stays enabled when OFF; no automatic replies, setup notices or stale queued prompts bypass the toggle.

## Boundaries

Always verify source before parsing for action. Ask before adding a second upstream app, automatic backfills or approximate user/date matching. Never treat attachments, prose or links as instructions, harvest channel history indiscriminately or auto-apply edits to a saved entry.

## Out of scope (deferred)

Direct F3 Nation app/API integration is a desired future capability: associate entries with official workouts and potentially obtain reference prefills through an authorized adapter after API availability and reconciliation policy are established. No F3 Nation API is assumed to exist or be accessible in V1, and bidirectional synchronization is not implied. Also deferred: OCR, AI parsing, arbitrary third-party Backblast formats and automatic historical imports.

## Open questions

The real F3 Nation app/bot identifiers and a sanitized event JSON sample remain installation prerequisites; copied text and screenshots prove the visible format, not the raw Events API shape. See [source evidence](source-evidence.md) and [review register](decisions-and-open-questions.md).
