# Spec: Entry ledger — V1

Module id: `entry-ledger`. Status: proposed. Depends on: `workspace-foundation`.
Inherits [the common contract](SPEC-common.md).

## Objective

Own the authoritative competition entry, reproducible scoring, historical corrections, admin archiving, duplicate prevention and an enforceable season lock. Slack messages are views of these records, never the database of record.

An entry is the aggregate this module owns: one Yeti Man submission for a referenced workout with a set of attending PAX. The official workout is owned by the F3 Nation app. This ledger stores a competition-purpose reference snapshot, not an authoritative replica of the official workout. Entry corrections, archive and restore never write back to F3 Nation or alter the official workout lifecycle.

## Season and scoring requirements

LEDGER-01: Seasons use a stable `seasonId`, unique region-local selector and explicit inclusive admin-configured start/end dates. December 1 through February's last day is the proposed initial interval, not a permanent restriction. Support same-year, non-winter and pre-official-date testing intervals; leap years remain correct. Resolve eligibility by referenced workout date in the season timezone, never submission/posting time. Permit historical entry in open configured seasons. Reject invalid/overlapping intervals and any reference date outside them. See CONFIG-06 through CONFIG-08 in [the configuration contract](configuration-contract.md).

LEDGER-02: Require a non-null `workoutReference.aoId` identifying an existing configured AO in the same region, valid local date/start time and at least one distinct eligible PAX Slack user ID. No entry can exist without its AO reference; the AO display name/channel alone is insufficient. Each PAX is an attendee of the referenced workout; persist his Slack identifier in `paxUserIds` for future reference, correction and possible F3 Nation integration. Save reference local date, `HH:mm`, IANA timezone, UTC start instant and offset. Explicitly resolve repeated/invalid local times and reject impossible dates. Reject any entry whose referenced workout start instant is later than the server's current time, even inside a configured season; exactly-at-start is eligible. Entry creation/update timestamps remain distinct.

LEDGER-03: Accept only whole Fahrenheit temperatures between -40 and 120 inclusive. Trim surrounding whitespace in text input and parse a signed base-10 integer strictly; reject blank values, units, decimal notation, exponents, NaN and Infinity. Never clamp or round. Actual temperature at the workout's beginning is supplied by the submitter; the app does not verify weather or substitute wind chill.

LEDGER-04: Score using the region's validated versioned scoring table, seeded with the original six bands in [CONFIG-09](configuration-contract.md#configurable-temperature-to-points-table). Admins may change bounds/integer points and add/remove bands at any time; reject overlapping inclusive bands. Six and 0–5 are not fixed limits. Persist the applicable `scoringPolicyId`/`scoringPolicyRevision` and server-derived `pointsPerPax` on every entry/revision; never trust client points. After an admin confirms an impact preview, recalculate every open season's existing entries; locked seasons retain their recorded scores and policy references. Apply the versioned/fenced publication rules in CONFIG-14 through CONFIG-17. Zero-point attendance adds no qualifying day; nonnegative custom values contribute to totals, while a qualifying day still requires at least one positive-point attendance. Under the default table, entries for two distinct 20°F workouts on one date yield 4 points and one qualifying day for a PAX attending both.

LEDGER-05: Patch earned is `seasonPoints >= 40`. This is the clarified threshold and takes precedence over the initial request. Never use a greater-than-40 comparison. Totals may fall below 40 after an authorized correction in an unlocked season; eligibility follows current authoritative records.

## Record identity and updates

LEDGER-06: An entry has a stable opaque `entryId`. Its V1 duplicate-detection key is `(teamId, regionId, workoutReference.aoId, workoutReference.localDate, workoutReference.localStartTime)`, inferred from the referenced workout rather than an official workout identifier. Enforce a unique compound index, including archived entries. This key enforces one competition entry per referenced workout in the tenant; it is not a globally authoritative workout identity. Correcting reference date/time does not change `entryId`. Concurrent initial saves for the same inferred reference converge on one entry; the losing attempt shows it rather than overwriting it.

LEDGER-07: Slack source identity `(teamId, regionId, channelId, messageTs)` maps uniquely to an entry or pending entry draft, with a provenance role such as Preblast reference or Backblast trigger. Preserve Slack timestamps as strings. A Slack message ID is neither `entryId` nor an official workout ID. The same Backblast retried, edited or reposted must not produce duplicate credit. The inferred reference key protects a manual/Backblast overlap; source identity prevents a corrected original entry from being recreated from its old Backblast fields.

LEDGER-08: Matching an existing manual entry attaches provenance in an open season without changing its saved temperature, attendance, corrected reference date/time or submitter. No unconfirmed source data changes earned points. If time is ambiguous or several candidates exist, require explicit selection rather than attaching to the nearest time. A source already linked to an entry follows that entry even if its corrected workout reference differs from its original message.

LEDGER-09: Each save requires an expected record version, reviewed configuration/scoring revision and a client operation key bound to tenant, actor and payload digest. Recheck required setup, applicable date interval and policy at commit. If settings changed since the form was reviewed, reject with `CONFIG_VERSION_CONFLICT` and show the impact before a fresh Save; do not quietly change awarded points. A repeated successful operation returns its existing receipt; the same key with a different payload is rejected. Stale expected record versions fail with `VERSION_CONFLICT`; preserve proposed edits and show current values. Never use last-write-wins.

LEDGER-10: A modification replaces the entry's authoritative competition values and increments its version; it is not a second entry and does not update the external workout. Recompute aggregates from committed entries, not additive counters that cannot be reversed reliably. Duplicate attendance IDs collapse to one attendee. Removing an attendee removes his points/day contribution from that entry; editing reference date/AO or temperature moves the contribution accordingly. The confirmed PAX list is the attendance used for Yeti Man scoring, not an update to F3 Nation's official attendance.

LEDGER-11: Every active workspace PAX can submit or correct any active region entry; only designated admins can archive entries. Archived entries cannot be edited through ordinary Save/Modify. Preserve `createdBy`, `createdAt`, `updatedBy`, `updatedAt`, and source Q IDs separately. The Q is a workout-lead role, not proof that the submitting actor is a Q. Retain append-only revisions with actor, reason/action, before/after values, version and operation ID. Config/season lifecycle changes also have audit entries. Do not collect full Backblast prose as audit.

LEDGER-12: Changing a record to collide with another natural identity is rejected with a link to the existing entry. No automatic merge or splitting is included. Correcting the date into another valid season requires both the source and destination seasons to be open. A locked original cannot be moved to bypass the lock.

## Atomic season locking

LEDGER-13: Only designated admins can create/configure season intervals and lock/unlock them through this module's registered admin Home panel. Season setup is available before capture readiness. Show selector, dates, status, active-entry/pending-draft counts before lock confirmation. Pending drafts warn but do not prevent the admin's decision. Record author/time/version/reason for lifecycle and date changes. No hard-coded February cutoff or automatic lock at a configured interval's end. Reject date edits to a locked season, overlaps and edits excluding retained active/archived entries.

LEDGER-14: Once a lock commits, reject all new saves, edits, archiving, restoration, source attachment and any other competition-record mutation for that season, including queued operations and forms opened earlier. Reports remain readable. Unlock is the only authorized transition reopening changes. Operational dedup/job receipt updates may continue but may not mutate frozen workout-reference facts captured on the entry or award points.

LEDGER-15: Use a transaction for entry/revision/idempotency/outbox changes and a write fence on the season document. Every mutation conditionally increments the open season's fence/version and checks the current confirmed configuration/policy revision before altering an entry. Lock/unlock and date edits write that same document. A read-only `locked: false` or cached setup check followed by a write is insufficient. Cross-season corrections fence both seasons in deterministic order; concurrent configuration activation and entry commits also contend on a region configuration fence. Retry transient transaction conflicts boundedly, then return an actionable error.

This makes lock/save ordering explicit: a save committed before the lock is included; a save ordered after it is denied. Concurrent locking/saving must not both claim precedence. Current admin/membership authorization must also be rechecked at commit, using a conflicting configuration version/fence when a role revocation races with an admin action.

LEDGER-16: Only admin configuration creates or changes explicit season intervals under unique tenant/season-ID and tenant/selector constraints. Do not use start year as a unique key or auto-create a default-open season from Save/report when a date is outside configured intervals. Validate nonoverlap transactionally while contending on a tenant season-catalog fence. A report never creates/unlocks a season. Use a transaction-capable deployment in either supported local mode and production. [MongoDB transaction semantics](https://www.mongodb.com/docs/manual/core/transactions/)

## Archiving erroneous entries

LEDGER-17: A designated Yeti Man admin may archive an entry added in error, within the same workspace and only while its season is open. Require a nonblank reason and explicit confirmation identifying the AO/date/time and the removal of points. Archive changes `status` from `active` to `archived`, increments record version and records `archivedBy`, `archivedAt` and `archiveReason`. Preserve workout-reference facts captured on the entry, original attribution, source links and append-only revisions. Never hard-delete the record or its audit. Already-archived requests are idempotent and do not add duplicate transitions/revisions.

LEDGER-18: Archiving removes the entry's contribution from all current PAX and AO scores, qualifying days, attendance/entry counts, rankings and patch eligibility. Recompute a PAX's qualifying days from remaining active entries: archiving one entry does not remove a day if another positive-point entry records him attending a different workout that day. Archived entries remain readable as explicitly archived historical records and in the admin archive list, not as eligible entry history. Any stored caches/snapshots must enforce the reporting freshness rules. The external workout and its Preblast/Backblast remain unchanged.

LEDGER-19: Retain the natural-key uniqueness constraint and source mappings for archived records. `findByWorkoutReference` and `findBySource` return status as well as identity; do not filter out archived matches and accidentally permit recreation. Reject ordinary edits, stale initial saves and source-driven reactivation with `ENTRY_ARCHIVED`. A matching manual entry or late/replayed/edited Backblast points to the archived record and cannot award points or open an active capture draft. A repeated old Save receipt may acknowledge the historical commit but must display current archived state, never replay its former active summary.

LEDGER-20: an admin can explicitly restore an accidentally archived entry while the season is open, with confirmation and a nonblank reason. Restoration preserves all facts, adds an audit revision, increments version and returns the entry to `active`; it never creates a second entry or changes the external workout. Preserve previous archive/restore events in revisions even after clearing current archive metadata. Archive/restore use the same tenant/admin authorization, expected-version checks, operation receipts, season write fence and transactional audit/outbox as Save. Race tests must cover archive versus edit, restore and season lock. Restoration is confirmed V1 behavior; never restore through an ordinary Save or source replay.

LEDGER-21: Own the admin scoring-change preview and durable application coordinator. Recalculate all retained entries in each affected open season, preserving facts/archived status and recording old/new scoring references, points, admin, reason and operation ID in audit. Fence writes and publish a complete per-season scoring generation with entry-version checks; serve no mixed generation. Immutable staged entry-score projections are calculation results keyed to entry/policy/generation, not a second authoritative leaderboard. Keep original scoring revisions and historical generations for audit. Failed work is resumable and visible, never an implicit partial-success update. Unlocking an outdated-policy season uses the reviewed catch-up workflow in CONFIG-17. Initial policy setup with no history needs no migration.

LEDGER-22: Provide the admin-only cross-season entry-list query defined in [the admin browser contract](admin-entry-browser.md). Apply tenant/admin authorization before query execution; support current/selected/all seasons, Active/Archived/All, optional AO and credited PAX filters combined with AND, and deterministic workout-time/entry-ID ascending or descending order before pagination. Defaults are current season, Active and newest first. Retain inactive AO/PAX identity filtering for historical rows, include lock state/current published scoring in results, and validate every cursor against actor/query context. UI-only list state cannot bypass per-entry permissions, season/scoring fences, expected versions or uniqueness checks.

## Data model

| Collection | Key fields |
|---|---|
| `seasons` | Tenant keys, seasonId, selector, label, startDate, endDate, timezone, state `open/locked`, mutationFence, published scoring policy/generation, pending recalculation operation/status, lock/unlock audit metadata |
| `entries` | Tenant keys, entryId, seasonId, workoutReference snapshot, temperatureF, distinct paxUserIds, pointsPerPax, scoringPolicyId/scoringPolicyRevision, status `active/archived`, archive actor/time/reason when archived, version, created/updated attribution |
| `entrySources` | Tenant keys, channelId, messageTs, source role/type, entryId/draftId, normalized source metadata and parser version |
| `entryRevisions` | Tenant keys, entryId, version, actor, operation, before/after snapshot, committedAt |
| `operationReceipts` | Tenant keys, operation key, actor, payload hash, outcome, entry/version reference |
| `messageOutbox` | Tenant keys, operation key, entryId, desired revision, destination, kind, status and retry state |
| `scoringRecalculations` | Tenant keys, operation ID, confirming admin, old/new policy revisions, preview binding, affected season fences/progress, status/errors and resumable checkpoints |
| `entryScoreGenerations` | Tenant keys, entryId, seasonId, entry fact version, generation ID, policy reference, points and associated audit revision; unique tenant/entry/fact-version/generation |

`workoutReference` contains `aoId`, `localDate`, `localStartTime`, `timezone`, derived UTC start instant `startAtUtc`/offset, optional title and source Q IDs. These are the competition's confirmed reference values, with source provenance retained for comparison. It may also contain an optional `externalReference` with provider, externally verified opaque workout ID and verification provenance. Leave that reference absent in V1 unless a real identifier is explicitly supplied and verified by a supported future adapter; do not fabricate it from AO/date, Slack timestamps or `entryId`. No official-workout ID is required to save a manual or Slack-triggered entry. There is no locally owned workout collection.

Unique indexes: tenant/season-ID and tenant/selector; tenant/entryId; tenant/`workoutReference.aoId`/`workoutReference.localDate`/`workoutReference.localStartTime`; tenant/channel/messageTs; tenant/entryId/revision; tenant/operation-key. Report indexes start with tenant and season, using nested reference AO/date and attendee fields as measured appropriate. Provision indexes before accepting writes. Retain receipts/source mappings long enough that retries or source replay cannot recreate historical credit; do not put business source mappings under a short TTL.

Do not persist independent leaderboard totals in V1. An optional later cache must be tenant/season/revision-keyed and disposable. Any record split across source and revision collections is saved transactionally.

## Provider contracts

```text
getSeason(context, seasonSelector) → Season | null
configureSeason(context, seasonId?, datesAndSelector, expectedVersion, operationKey) → Season
findSeasonByDate(context, localDate) → Season | null
getEntry(context, entryId) → EntryView | NOT_FOUND_OR_FORBIDDEN
findByWorkoutReference(context, {aoId, localDate, localStartTime}) → EntryView | null
findBySource(context, {channelId, messageTs}) → EntryView | DraftRef | null
saveEntry(context, input, expectedVersion, expectedConfigurationRevision, operationKey) → SaveReceipt
archiveEntry(context, entryId, reason, expectedVersion, operationKey) → ArchiveReceipt
restoreEntry(context, entryId, reason, expectedVersion, operationKey) → RestoreReceipt
listArchivedEntries(context, seasonId, cursor) → AdminArchivePage
listAdminEntries(context, {season, aoId?, paxUserId?, status, sort, cursor?}) → AdminEntryPage
attachSource(context, entryId, source, operationKey) → SourceReceipt
setSeasonLock(context, seasonId, locked, expectedVersion, operationKey) → Season
previewScoringChange(context, proposedPolicyRevision) → ScoringImpactPreview
applyScoringChange(context, previewId, operationKey) → RecalculationReceipt
getRecalculationStatus(context, operationId) → RecalculationStatus
readSeasonEntries(context, seasonId, filters, cursor) → ConsistentPage
registerSeasonAdminPanel(homeRegistry) → composition-root registration
```

`EntryView` resolves points/policy through the season's published scoring generation and current entry fact version; it must not expose a stale points field during staged application. Normal saves/edits atomically add the matching score projection for the current generation and new fact version. Immutable projections for older versions remain auditable.

`saveEntry` accepts competition fields plus the structured `workoutReference`, not an official-workout mutation payload. `SaveReceipt` includes entry/version, per-attendee points, committed state and summary refresh status. Save success means durable DB commit, even if Slack rendering is pending. A retry returns the same receipt and cannot award twice. Archive/restore receipts identify the current status/version and pending summary refresh; archive-list access requires admin authorization. Competition read/aggregation APIs default explicitly to `status: active`; archived-record inspection is a separate explicit filter/access path, not an accidental inclusion in totals. Foreign/missing IDs use indistinguishable public errors. Consumer read APIs expose no tokens or other tenant data. Reporting can request a scoped aggregation adapter/read snapshot from this provider rather than bypassing it with raw MongoDB access.

## Commands and testing strategy

Future verification: `npm run test:module -- entry-ledger`, then `npm run check`.
Implementation location/style follow the common contract.

## Success criteria

Acceptance cases must include:

- LEDGER-A1: Every temperature from -40 through 120 agrees with the default policy and additional custom policies; test invalid -41, 121, decimals and empty input, plus scoring policies with negative/fractional points, gaps and overlaps.
- LEDGER-A2: Exact boundaries -40, 0, 1, 10, 11, 18, 19, 25, 26, 32, 33 and 120 are covered explicitly.
- LEDGER-A3: Default December/January mapping, leap day, custom same-year/non-winter/testing intervals, inclusive boundaries, overlapping seasons, timezone-midnight and invalid/future dates behave as specified.
- LEDGER-A4: Multiple same-day workouts add points independently, while duplicate attendance and duplicate saves do not.
- LEDGER-A5: At 39 points patch is false; at 40 and 41 it is true. Corrections update that status.
- LEDGER-A6: Real concurrent manual/Backblast creates, conflicting edits and repeated operation keys cannot double count or silently overwrite.
- LEDGER-A7: A lock/save race uses real transactions and proves no save ordered after lock commits; stale forms, source attachment, cross-season moves and queued operations respect locks.
- LEDGER-A8: Rollback or Slack API failure never yields partial record/revision writes; restart safely retries summary rendering without resaving facts.
- LEDGER-A9: A local admin can archive with a reason; a normal PAX or foreign admin cannot. Data, source links and revisions survive; a repeated Archive adds no duplicate transition. Locked seasons and stale versions reject archiving/restoration.
- LEDGER-A10: Archiving reverses points/counts and can revoke a 40-point patch result; same-day positive attendance elsewhere preserves the qualifying day. An authorized restore recovers the exact contribution once.
- LEDGER-A11: Source replay, duplicate manual entry, a previously successful Save retry and stale editors cannot reactivate an archived record. Archive/edit/restore/lock races serialize correctly and outbox rendering shows current status.
- LEDGER-A12: Manual and Slack-triggered entries save without an official workout ID; entry ID and Slack source IDs remain distinct. Reference corrections, scoring, archive and restore make no direct F3 Nation calls and cannot change an official workout. Optional future external identity does not replace entry identity or validation.

- LEDGER-A13: Missing/foreign AO references and missing Slack PAX IDs cannot be persisted. Re-read entries after label changes to prove identities survive.
- LEDGER-A14: Admin date edits, any band count and integer points validate correctly; stale setup/policy/date forms fail at commit. Locked entry facts/scores cannot change indirectly through configuration.
- LEDGER-A15: A confirmed policy change recalculates multiple open seasons, including historical and archived entries, while locked-season values/policy references remain unchanged. Scores, qualifying days, PAX/AO ranks and 39/40-point patch outcomes change consistently; archived entries remain excluded.
- LEDGER-A16: Preview Cancel and stale confirmation change nothing. Edit/archive/lock/unlock/new-season races cannot bypass fences or omit an open season. Crash/retry/batch failure never duplicates audit transitions or exposes mixed-generation totals; operation status remains pending until completion.
- LEDGER-A17: Unlock of an outdated-policy season explicitly previews catch-up, records unlock and completes recalculation before accepting mutations or relocking. New entry saves after publication use the newly applied policy.

- LEDGER-A18: Admin list predicates produce exact combined AO/PAX/season/status results before stable startAtUtc/entry-ID paging. Both directions and equal-time rows are covered, historical/archived rows remain queryable, and unauthorized/foreign/tampered cursors fail closed. Browse-driven edits retain ordinary duplicate/lock/version/audit guarantees.

## Boundaries

Always use the ledger provider for competition writes, audit revisions and recheck locks. Admin edits to bands/points are authorized configuration actions. Ask before changing scoring-validation/versioning semantics, identity keys, merging saved entries or adding automatic prize logic. Never hard-delete entries, allow ordinary Save to unarchive one, use a UI-hidden button as the only lock enforcement or trust client-supplied points.

## Out of scope (deferred)

Hard deletion, entry merging, weather verification, cross-region attendance credit and unreviewed retroactive rules migrations. Erroneous entries use admin archiving, not fabricated attendance corrections or deletion.

## Open questions

Q02 is resolved: recalculate open seasons after impact review; preserve locked-season scores. Future-start rejection and admin restoration in unlocked seasons are also confirmed; neither remains an open question. See [the review register](decisions-and-open-questions.md).

## Implementation task links

See [the complete issue index](implementation-tasks.md) and [execution plan](../../tasks/plan.md). The links below map this document’s requirements to implementation and verification work; they do not change requirement semantics or imply completion.

| Task / issue | Scope | Requirements / acceptance cases |
|---|---|---|
| [T08 #9](https://github.com/abobwhite/f3-yeti-man/issues/9) | Implement configurable scoring and workout-reference validation | LEDGER-02, LEDGER-03, LEDGER-04, LEDGER-05 |
| [T09 #10](https://github.com/abobwhite/f3-yeti-man/issues/10) | Persist seasons and enforce transactional season write fences | LEDGER-01, LEDGER-13, LEDGER-14, LEDGER-15, LEDGER-16 |
| [T11 #12](https://github.com/abobwhite/f3-yeti-man/issues/12) | Save versioned entries atomically with duplicate and retry protection | LEDGER-06, LEDGER-07, LEDGER-09, LEDGER-10, LEDGER-11, LEDGER-12, LEDGER-15 |
| [T12 #13](https://github.com/abobwhite/f3-yeti-man/issues/13) | Publish version-aware saved entry summaries through the outbox | LEDGER-A8 |
| [T14 #15](https://github.com/abobwhite/f3-yeti-man/issues/15) | Modify entries privately without replacing the committed public view | LEDGER-10, LEDGER-12 |
| [C1 #16](https://github.com/abobwhite/f3-yeti-man/issues/16) | Verify the complete manual-entry milestone | LEDGER-A1, LEDGER-A2, LEDGER-A3, LEDGER-A4, LEDGER-A5, LEDGER-A6, LEDGER-A7, LEDGER-A8, LEDGER-A12, LEDGER-A13 |
| [T17 #19](https://github.com/abobwhite/f3-yeti-man/issues/19) | Manage configurable season dates and lock controls in App Home | LEDGER-01, LEDGER-13, LEDGER-14, LEDGER-16 |
| [T18 #20](https://github.com/abobwhite/f3-yeti-man/issues/20) | Preview versioned scoring-policy changes and affected open seasons | LEDGER-21 |
| [T19A #21](https://github.com/abobwhite/f3-yeti-man/issues/21) | Stage resumable scoring-generation recalculation batches | LEDGER-21 |
| [T19B #22](https://github.com/abobwhite/f3-yeti-man/issues/22) | Publish complete scoring generations with consistent read semantics | LEDGER-04, LEDGER-21 |
| [T20 #23](https://github.com/abobwhite/f3-yeti-man/issues/23) | Wire scoring review, progress and unlock catch-up into admin flows | LEDGER-13, LEDGER-21 |
| [C2 #24](https://github.com/abobwhite/f3-yeti-man/issues/24) | Verify complete admin configuration and scoring lifecycle | LEDGER-A14, LEDGER-A15, LEDGER-A16, LEDGER-A17 |
| [T29 #34](https://github.com/abobwhite/f3-yeti-man/issues/34) | Reconcile Backblast capture with existing manual and archived entries | LEDGER-07, LEDGER-08 |
| [T31 #37](https://github.com/abobwhite/f3-yeti-man/issues/37) | Archive and restore entries through the audited ledger lifecycle | LEDGER-17, LEDGER-18, LEDGER-19, LEDGER-20 |
| [T33 #39](https://github.com/abobwhite/f3-yeti-man/issues/39) | Query the complete admin entry browser with stable filtered pagination | LEDGER-22 |
| [C5 #52](https://github.com/abobwhite/f3-yeti-man/issues/52) | Verify the complete non-scheduled V1 feature set | LEDGER-A9, LEDGER-A10, LEDGER-A11, LEDGER-A18 |
