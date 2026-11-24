# Spec: Entry capture — V1

Module id: `entry-capture`. Status: proposed. Depends on: `entry-ledger`.
Inherits [the common contract](SPEC-common.md).

## Objective

Capture and maintain Yeti Man competition entries using the same fields and validation for a Backblast thread prompt and manual slash-command entry. Keep collection and correction inside Slack with explicit Save/Cancel and a durable textual summary. Workout date/time, AO, title and Qs are reference context; attendance and temperature are confirmed for competition scoring. No action here creates or edits an official F3 Nation workout.

## Entry points and fields

CAPTURE-01: First enforce the shared required-setup gate. Before setup, `/yeti configure` opens admin configuration and every other slash command returns current missing settings without opening a form. Once configured, `/yeti` or `/yeti log` starts manual entry. `/yeti help` explains capture/report commands, eligibility and patch threshold. Unrecognized arguments show help without saving. A custom slash command is invoked at conversation level, not within a thread; Backblast actions are the thread entry path. [Slack slash commands](https://docs.slack.dev/interactivity/implementing-slash-commands/)

CAPTURE-02: Initial Backblast-triggered capture remains a single app-owned inline message in the Backblast thread containing all fields and Save/Cancel. Manual `/yeti` or `/yeti log` capture is private to the invoker; use a private modal with the same fields and Save/Cancel, not a public draft message. On a successful manual Save, post the durable saved summary in the selected AO's configured public channel and give the submitting user private confirmation/link, regardless of the invoking conversation. Nothing is posted publicly for an incomplete/cancelled manual form. The private editor is not the canonical entry record.

| Field | AO-channel behavior | Outside an AO channel |
|---|---|---|
| AO | Fixed configured AO from channel; labeled read-only text | Required select of active AOs configured for this region |
| Workout date | Backblast date, otherwise region-local today; editable | Region-local today; editable |
| Workout start time | Matched source time, then weekday schedule candidate; editable | Selected AO's weekday schedule; editable |
| Actual temperature °F | Required plain-text integer input, blank on initial capture | Same |
| PAX attendance | Editable multi-user select prefilled from Backblast | Required multi-user select, initially empty |

There is no read-only flag in Slack's plain-text input schema. Represent AO as a labeled section/text value and enforce immutability server-side; do not fake a disabled input. Message input blocks and plain-text inputs are supported in current Slack documentation. Use plain-text rather than modal-only number input for temperature in the message. [Block Kit surface matrix](https://docs.slack.dev/reference/block-kit/), [input schema](https://docs.slack.dev/reference/block-kit/blocks/input-block/), [plain-text input schema](https://docs.slack.dev/reference/block-kit/block-elements/plain-text-input-element/)

CAPTURE-03: Use `datepicker` for local date, `timepicker` for `HH:mm`, and `multi_users_select` with `initial_users` for known attendance. Use `static_select` for finite AO options within Slack's current limits; switch to a tenant-scoped external select over the same finite configured list if the list exceeds those limits. That is not arbitrary channel selection. [Date picker](https://docs.slack.dev/reference/block-kit/block-elements/date-picker-element/), [time picker](https://docs.slack.dev/reference/block-kit/block-elements/time-picker-element/), [multi-select](https://docs.slack.dev/reference/block-kit/block-elements/multi-select-menu-element/), [select menus](https://docs.slack.dev/reference/block-kit/block-elements/select-menu-element/)

Render form/summary headings as “Yeti Man entry” or “Edit Yeti Man entry.” Field labels may say “Workout date” and “Workout start time” because they describe the reference, not an app-owned workout. Saving confirms an entry and never implies a workout was created or synchronized in F3 Nation.

CAPTURE-04: Input changes may refresh time defaults only while the time remains an untouched default. A user-edited time must not be silently replaced when AO/date changes. If new AO/day has zero or several candidate times, ask the user to confirm a time. Label fallback origin: matched Preblast, AO schedule or user entry. Never prefill the Backblast posting timestamp as start time.

CAPTURE-05: Local, active, non-bot members are the proposed selectable attendance policy. Validate every selected ID against the installed workspace; a user picker alone does not prevent Slack Connect foreign selections. Previously credited deactivated users remain on unchanged records and reports; permit retaining/removing an existing historical ID on correction but do not newly add an ineligible identity. Resolve labels by display name → real name → stable user-ID fallback. Do not require emails.

CAPTURE-06: Missing/unresolved Backblast PAX, FNGs/visitors without a workspace Slack account, count mismatch or Qs absent from PAX produce a clear review warning. Allow Save for the positively identified PAX (at least one is still required), while explicitly identifying that unresolved attendees receive no points yet. Preserve a minimal unresolved-attendance warning/count and source provenance, not fabricated Slack IDs or scoring identities. Once an attendee has a valid local Slack account, any authorized PAX can add him by modifying that entry in an unlocked season; recompute totals once without creating another entry. Prefill only resolved IDs, never fuzzy-match names or count HC commitments as attendance, and never silently truncate an oversized roster.

## State and lifecycle

```text
Backblast: inline draft → Save → public thread summary
Manual: private form → Save → public AO-channel summary + private confirmation
Saved entry: public summary + Modify → private editor → Save → updated public summary
Private Cancel: discard unsaved input; public committed summary stays unchanged
```

CAPTURE-07: Initial Save validates required setup, AO/PAX IDs, actual workout start not later than now, configured date interval and reviewed configuration/scoring revision, then commits through the ledger. Missing setup or changed settings reject stale forms with actionable guidance. Backblast replies OFF never rejects an otherwise valid manual Save. For an inline message, read the submitting actor's complete `state.values`; for a private modal, read `view.state.values` from its submission. Do not combine another actor's field events or reuse cleared values. Input dispatch events alone award no points. [Block action state](https://docs.slack.dev/reference/interaction-payloads/block_actions-payload/), [modal lifecycle](https://docs.slack.dev/surfaces/modals/)

CAPTURE-08: For initial inline Backblast capture, replace the collection message in place with a saved textual summary. For manual capture, publish a new app-owned summary in the selected AO's public channel and return private confirmation/link; never try to convert an ephemeral response into a public message. Summaries show AO, region-local date/time/timezone, temperature, points per PAX, credited roster, any unresolved-attendance warning, original submitting actor and latest modifier/time. Display source Qs separately. Include Modify while open and a locked-season notice without Modify when locked. Maintain accessible fallback text. Each message view refers to the same stable entry ID; private inputs never appear as a shared draft summary.

Example summary content:

```text
Yeti Man entry
Chuckletown · Dec 4, 2026 · 05:30 America/Chicago
Actual starting temperature: 20°F · 2 points per PAX
Attendance: @PAX A, @PAX B
Submitted by @Recorder · Last modified by @Recorder
[Modify]
```

CAPTURE-09: Modify on any saved entry, whether manual or Backblast-linked, opens a private editor for the clicking PAX with prefilled values and Save/Cancel. Keep the public saved summary visible and unchanged until a successful commit; never convert it back into shared inputs. Bind fixed/selectable AO to the verified originating context, not the modal surface: AO remains fixed when invoked from a configured AO channel, and is selectable from an authorized non-AO context such as an entry detail view in App Home. Expose that detail/edit path so an AO correction remains possible outside AO channels. Recheck tenant, origin, expected version, eligibility and season lock on Save. If an out-of-AO-context correction changes AO, publish/update the canonical summary in the newly selected AO channel and leave older views as linked current-entry references. Never move/edit the original F3 Backblast or duplicate the ledger entry.

CAPTURE-10: Cancel on manual initial capture closes the private form, saves nothing and posts no public message. Cancel on initial inline Backblast capture saves nothing and leaves a compact thread notice with Enter details. Cancel in any private Modify editor discards unsaved fields; the public committed summary remains unchanged. Cancel never deletes/restores an entry, cancels an external workout or overrides another user's newer committed version. If another editor saved meanwhile, retain/show the latest committed summary rather than replaying the version from the cancelled editor.

CAPTURE-11: Draft/edit sessions bind tenant, actor, entry/draft, verified origin, destination and expected entry/configuration versions, with opaque IDs and expiry. Proposed inactivity expiry is 30 minutes. Expired private forms reopen from current committed state. Multiple actors can edit privately; the first valid Save commits and stale later versions must be reviewed, never merged automatically. UI render jobs use current generation/version checks. Only initial Backblast capture is a shared inline form, and its saved data always comes from the actual submitting actor's state.

CAPTURE-12: Reject unauthorized, cross-tenant, locked, future-start, scoring-update and stale requests server-side. Acknowledge promptly and show clear saved/pending/error state. Private modals can show supported submission validation errors; inline message forms send private actionable feedback to the submitting actor. Preserve pending user values without publishing invalid/unsaved data. Handle modal validation/commit acknowledgment within Slack timing requirements; durable follow-up work must not claim success before commit. A post-commit channel rendering failure is pending publication, not a failed ledger save.

CAPTURE-13: Persist the entry and summary-outbox intent transactionally. A rendering failure after commit says “Saved; message update pending,” not “Save failed.” Retry Slack updates using the latest record version without another ledger save. Ordinary app messages can be updated later; long-lived Modify cannot depend on an original short-lived response URL. [Slack interaction response lifecycle](https://docs.slack.dev/interactivity/handling-user-interaction/)

CAPTURE-14: A manual save colliding with an existing active entry links to that record and asks for Modify; it does not silently replace its attendance. If the match is archived, show its Archived summary without Modify or a new Save path. If the same Backblast has several prompt views, all point to one authoritative record; saving one refreshes the others as practical, and their stale controls remain protected by ledger checks.

CAPTURE-15: For a designated admin viewing an active saved entry in an open season, provide an Archive action through the summary's admin controls or an admin entry-management panel registered by this module in App Home. Open a focused confirmation form showing AO/date/time and explaining that the entry will stop counting. Require an archive reason and explicit Archive/Cancel. Cancel has no effect. Archive routes through the ledger's admin-only provider; hiding the action from regular PAX is not sufficient authorization. Keep an admin entry point to locate records by season/AO/date when the original Slack summary is unavailable.

CAPTURE-16: After archiving, update known canonical views to an explicitly Archived, read-only summary with retained reference/competition details, archive actor/time/reason and Excluded from Yeti Man results. Remove Modify/Save; never delete source messages. A designated admin can explicitly Restore in an unlocked season with confirmation and an audit record (using the ledger's reason/operation metadata), preserving identity and applying the current published policy once. Non-admins and locked seasons cannot restore. Stale private editors and render jobs must not reactivate archived state. Admin Home lists retained archived entries for inspection/restoration.

CAPTURE-17: During an affected season's scoring recalculation, show “scoring update in progress” for attempted entry mutations; preserve user input and require review of fresh policy/points after publication. Update summaries to current entry scores/policy generation after completion through the durable outbox. Stale summary/render jobs must not restore old scores, and a policy update alone must not refresh locked summaries with new points.

CAPTURE-18: At implementation priority 5, provide the confirmed [admin entry browser](admin-entry-browser.md) in private Slack App Home: current/past/all seasons, combined AO/PAX filters, Active/Archived/All status (Active default), referenced workout date/time order (newest default, reversible), complete paginated access and one-entry-at-a-time private Modify. Keep the saved season/filters/sort when returning after Save/Cancel, including meaningful feedback when a correction moves a row outside the query. Locked entries remain viewable/read-only; per-entry archive/restore uses the existing ledger rules. Do not introduce multi-row changes or a second editing implementation.

## Provider contracts and persistence

This module also owns disposable per-admin browser query state; it must not be shared across admins or treated as edit authorization.

This module owns `captureDrafts` (tenant/actor/source binding, proposed fields, verified invoking context, editor privacy, selected AO destination, unresolved-attendance warning, expected entry version, reviewed configuration/scoring revision, generation, expiry), plus message-view references. Drafts are not reportable entries. A source-bound canonical draft identity must survive or be reconstructible after expiring actor sessions; TTL cleanup must not create a second prompt for the same Backblast.

```text
requestCapture(context, sourceRef, prefill, destination) → CaptureReceipt
showExistingEntry(context, entryId, destination) → MessageView
handleCaptureAction(context, actionEnvelope) → ActionReceipt
openPrivateEntryEditor(context, entryId?, verifiedOrigin, trigger) → PrivateEditor
openAdminEntryBrowser(context, savedBrowserState?) → PrivateHomeView
```

`requestCapture` is idempotent by verified source reference and only accepts prefill as untrusted candidate values structured as `workoutReference`, temperature/attendance candidates and provenance. Its receipt identifies pending/existing/cancelled state, not awarded points. Manual capture may have no Slack source or external workout ID; allocate an entry draft ID and apply the same workout-reference deduplication when saving. `destination` must be a verified local channel/thread. Ingestion calls these contracts; it never constructs a Slack UI or writes an entry directly. This provider boundary is reusable by a future approved F3 Nation adapter without placing F3 API calls in the capture module.

## Commands and testing strategy

Future module check: `npm run test:module -- entry-capture`. Full check: `npm run check`.
Source/test structure and code style inherit SPEC-common.md.

## Success criteria

- CAPTURE-A1: Initial Backblast inputs appear together inline in its thread; manual/Modify forms are private and correctly prefilled, with AO fixed/selectable by origin context.
- CAPTURE-A2: Manual entry from AO/non-AO contexts keeps drafts private and posts only the saved summary in the selected AO channel, with private confirmation; Cancel posts nothing.
- CAPTURE-A3: Save/Modify/Save replaces one record; both Cancel paths award nothing and preserve committed data.
- CAPTURE-A4: Two actors' interactions never combine fields; stale Save/Cancel/render actions cannot overwrite newer data.
- CAPTURE-A5: Invalid temperature, empty roster, foreign/invalid IDs, missing time, expired form and locked season have actionable feedback.
- CAPTURE-A6: Saved summaries show the actual submitting/modifying users and retain current state after retries/restart.
- CAPTURE-A7: Desktop/mobile sandbox tests and generated-layout validation pass before launch; no payload validity is assumed from this prose specification.
- CAPTURE-A8: Admin archive discovery, reason/confirmation/Cancel, archived-summary replacement and archive-list inspection work without deleting data/messages. Non-admin and locked-season actions fail server-side; stale editors cannot undo archive. Restore is confirmed and uses the same authorization, season-lock and audit protections.
- CAPTURE-A9: Forms and summaries identify the saved object as a Yeti Man entry; reference-field corrections and archive do not modify source Slack posts or issue calls to the F3 Nation app.

- CAPTURE-A10: Required setup gates manual/automated capture and stale Save alike; errors identify the missing admin settings. Dates/scoring use the reviewed region configuration. Manual entry and explicit existing-message actions remain available when automatic replies are OFF.

- CAPTURE-A11: Modify for both manual and Backblast-linked entries opens an actor-private editor while the public summary stays visible; stale Save/Cancel cannot replace a newer version or expose drafts.
- CAPTURE-A12: A known-PAX roster can save with an explicit unresolved-attendee warning and no provisional credit; adding a newly identified local user later updates the same unlocked entry once.
- CAPTURE-A13: Reject a future start even within the configured testing season; at-start/past entries remain eligible. Non-AO edits can correct AO and relocate canonical summary references without touching the F3 source or duplicating credit.

- CAPTURE-A14: BROWSE-A1 through BROWSE-A7 pass: the admin-only browser filters/sorts/pages all selected entries and opens the existing private editor, preserves query state, protects locked/archived rows and follows priority 5.

## Boundaries

Always route Save through the ledger and use the actor's submitted full state. Initial Backblast capture is inline; manual forms and every Modify editor are private. Any change to those confirmed visibility rules requires review. Never treat Cancel as deletion or a displayed fixed AO as sufficient server-side enforcement.

## Out of scope (deferred)

Bulk CSV import, awarding points to PAX without workspace Slack identities, hard deletion/entry merging, and conversational/AI data collection. Admin archiving is included.

## Open questions

Capture privacy/destination, unresolved-attendee handling, restore, future-start rejection and public-AO-only scope are confirmed. Proposed inactivity expiry and remaining local-member eligibility details are recorded in [the review register](decisions-and-open-questions.md).

## Implementation task links

See [the complete issue index](implementation-tasks.md) and [execution plan](../../tasks/plan.md). The links below map this document’s requirements to implementation and verification work; they do not change requirement semantics or imply completion.

| Task / issue | Scope | Requirements / acceptance cases |
|---|---|---|
| [T07 #8](https://github.com/abobwhite/f3-yeti-man/issues/8) | Build the leased durable-operation and message-outbox runtime | CAPTURE-13 |
| [T11 #12](https://github.com/abobwhite/f3-yeti-man/issues/12) | Save versioned entries atomically with duplicate and retry protection | CAPTURE-07, CAPTURE-14 |
| [T12 #13](https://github.com/abobwhite/f3-yeti-man/issues/13) | Publish version-aware saved entry summaries through the outbox | CAPTURE-08, CAPTURE-13 |
| [T13 #14](https://github.com/abobwhite/f3-yeti-man/issues/14) | Capture manual entries in private Slack forms | CAPTURE-01, CAPTURE-02, CAPTURE-03, CAPTURE-04, CAPTURE-05, CAPTURE-06, CAPTURE-07, CAPTURE-10, CAPTURE-11, CAPTURE-14 |
| [T14 #15](https://github.com/abobwhite/f3-yeti-man/issues/15) | Modify entries privately without replacing the committed public view | CAPTURE-09, CAPTURE-10, CAPTURE-11, CAPTURE-12 |
| [C1 #16](https://github.com/abobwhite/f3-yeti-man/issues/16) | Verify the complete manual-entry milestone | CAPTURE-A2, CAPTURE-A3, CAPTURE-A4, CAPTURE-A5, CAPTURE-A6, CAPTURE-A9, CAPTURE-A10, CAPTURE-A11, CAPTURE-A12, CAPTURE-A13 |
| [T20 #23](https://github.com/abobwhite/f3-yeti-man/issues/23) | Wire scoring review, progress and unlock catch-up into admin flows | CAPTURE-17 |
| [T28 #33](https://github.com/abobwhite/f3-yeti-man/issues/33) | Collect initial Backblast entry details inline in its thread | CAPTURE-02, CAPTURE-03, CAPTURE-04, CAPTURE-06, CAPTURE-10, CAPTURE-11, CAPTURE-12, CAPTURE-14 |
| [T29 #34](https://github.com/abobwhite/f3-yeti-man/issues/34) | Reconcile Backblast capture with existing manual and archived entries | CAPTURE-14 |
| [C4 #36](https://github.com/abobwhite/f3-yeti-man/issues/36) | Verify trusted source ingestion and inline capture | CAPTURE-A1, CAPTURE-A4, CAPTURE-A7, CAPTURE-A9, CAPTURE-A10, CAPTURE-A11, CAPTURE-A12 |
| [T32 #38](https://github.com/abobwhite/f3-yeti-man/issues/38) | Expose private admin Archive and Restore confirmation flows | CAPTURE-15, CAPTURE-16 |
| [T34 #40](https://github.com/abobwhite/f3-yeti-man/issues/40) | Browse and individually correct entries in private admin App Home | CAPTURE-18 |
| [T39 #45](https://github.com/abobwhite/f3-yeti-man/issues/45) | Complete command help, season selectors and report discoverability | CAPTURE-01 |
| [T40 #46](https://github.com/abobwhite/f3-yeti-man/issues/46) | Expose privacy-safe operational health and actionable failures | CAPTURE-12, CAPTURE-13 |
| [C5 #52](https://github.com/abobwhite/f3-yeti-man/issues/52) | Verify the complete non-scheduled V1 feature set | CAPTURE-A8, CAPTURE-A14 |
