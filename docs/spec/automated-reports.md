# Automated reports — V1

Status: proposed extension to the existing `reporting` module, requested by the user. Inherits [common engineering](SPEC-common.md), [configuration/readiness](configuration-contract.md), [reporting metrics](SPEC-reporting.md) and all region-isolation constraints. No new module or dependency direction is introduced.

## Objective and configuration

AUTO-01: Designated Yeti Man admins can configure **multiple independent report automations per region** in an admin Home panel registered by reporting. Each automation has its own name, season, ordered report sections/details, AO scope, destination channel, daily/weekly schedule and enabled/paused state. Create, inspect, preview, edit, pause/resume and archive configurations without affecting other automations. Archive disables future delivery while retaining configuration/run audit; it does not archive any entry. No scheduled report exists or posts until an admin explicitly saves/enables it. Report automations are optional and not another mandatory setup prerequisite.

AUTO-02: Required per-automation fields:

| Setting | Behavior |
|---|---|
| Name | Nonblank local label, for example “Chuckletown weekly” |
| Season | Default to the configured season containing region-local today; bind the saved automation to its stable `seasonId` |
| Included reports | One or more eligible report types; each section has its own display details and region/AO scope |
| Destination | One explicitly selected local Slack channel, saved by channel ID |
| Frequency | Daily or weekly |
| Day | Required weekday for weekly; not applicable for daily |
| Time | Required valid local `HH:mm`, interpreted in the region's configured IANA timezone |
| State | Enabled or paused; admin activation authorizes the configured recurring posts |

If there is no season containing today, show configured seasons and require explicit choice; do not silently schedule against an ended season or invent one. A future configured season can be selected in advance, but delivery begins only within its dates. Saving a schedule for an already ended season is rejected; it can be retained as paused historical configuration. Never roll an automation into a later season automatically. Offer duplication/editing with explicit season selection for the next season.

## Supported reports and configurable details

AUTO-03: Use the application's report registry, not a separate hand-maintained list. The full automation feature at implementation priority 6 must offer every supported report except `personal-results` (`/yeti me`): `pax-leaderboard`, regional `ao-leaderboard`, composite `ao-results` and `cold-entry-leaderboard` (`/yeti cold`). Reject forged personal/history sections at save and execution. Report types declare supported details, scopes and reusable render contracts when their manual capability is delivered; earlier manual-report milestones do not depend on building automation management, timers or dispatch. At priority-6 acceptance every supported non-me type must have scheduled rendering and be selectable. Setup/help/admin commands are not reports. Future report additions must extend the same catalog.

AUTO-04: Admins choose report sections/order and which supported details each section includes. For PAX leaderboard, offer rank, PAX label, points, qualifying days, entry-attendance count and regional patch status. For AO leaderboard, offer rank, AO label, points, active-entry count and competition-attendance instances. For cold-entry leaderboard, require rank, PAX and entry count at ≤32°F; offer points/days/regional patch status as additional details. The threshold label is fixed by the report definition, not inherited from the scoring policy. Identity/subject, season, scope, generated-at time and freshness labels are mandatory context rather than removable details. AO-specific output additionally requires the full AO total and both AO/region point columns in its PAX table; those confirmed details cannot be deselected. Offer sensible initially selected metric fields and an editable positive row limit within the renderer's documented message capacity. Reject unknown/unsupported fields and oversized compositions before enabling; preview precisely what will be posted. Detail selection changes presentation, never metric definitions or the 40-point patch rule. Daily/weekly frequency controls when these season-to-date reports are posted; it does not silently turn them into daily-only or weekly-only activity metrics.

AUTO-05: Each section can target the full region or a configured local AO; `ao-results` requires one AO. Every AO-specific result contains (1) that AO's total points across all PAX and (2) its PAX leaderboard with points at that AO beside total points across the region for the same season. AO-scoped requests for the other leaderboard types use this composite renderer. AO points/days/counts/rank use active entries referencing that AO; the comparison column uses the same PAX's active entries across all regional AOs. For a points report, rank by AO points then AO qualifying days; for `cold-entry-leaderboard`, add the local ≤32°F entry-count column and rank by that count with equal counts sharing rank. Preserve the selected metric instead of converting a count report into a points report; never sort by the regional point comparison. Calculate total AO points before top-N/pagination. Optional patch status is explicitly regional. The destination channel never changes scope. A valid inactive AO with historical entries remains reportable and labeled inactive; foreign/missing AOs are invalid.

Example independent automations:

| Name | Sections/scope | Schedule, region timezone | Channel |
|---|---|---|---|
| Chuckletown daily | Chuckletown AO total plus PAX AO/region points, with optional days | Daily at 08:00 | Configured `ao-chuckletown` channel |
| Region weekly | Region PAX leaderboard plus region AO leaderboard | Monday at 12:00 | Admin-selected regional channel |

## Season-bounded scheduling

AUTO-06: Evaluate recurring occurrences in the persisted region IANA timezone, never host timezone or a fixed UTC offset. A daily schedule has one occurrence per local date; a weekly schedule has one on the selected weekday. Compute UTC instants for execution and retain both intended local time and resolved instant in audit. Proposed daylight-saving default: a nonexistent local time runs at the first valid instant after that gap; a repeated local time runs on its first occurrence only. There is at most one delivery per local scheduled occurrence. Expose the timezone and next eligible run in configuration preview.

AUTO-07: Delivery is allowed **only from the bound season's start date through its program end date inclusive**, in that season's region timezone. The cutoff is the start of the following local calendar day, not a fixed number of UTC hours. No scheduled report, retry, delayed queue job or catch-up may newly initiate a post at/after that cutoff, even if its original occurrence was due earlier. Check current season dates immediately before dispatch. An already in-flight Slack request may arrive later; this bounded remote-delivery limitation is not a new allowed scheduled run. No automatic final report after the end date; manual reports remain available.

AUTO-08: Admin season-date changes recalculate next runs and delivery bounds for every bound automation and invalidate queued occurrences outside the revised interval. Include these scheduling effects in the date-change preview. An enabled automation can become eligible again if an admin explicitly confirms an end-date extension; an explicitly paused/archived automation stays paused/archived. Season lock freezes entry/scoring mutations, not report reads: enabled automations may continue displaying the locked final scoring generation until the program end date, then stop. A global policy change never silently substitutes new scores for that locked generation.

## Execution, authorization and failure behavior

AUTO-09: Reuse the same validated tenant-scoped reporting providers/metrics as manual reports. At execution and immediately before posting, validate active installation, required setup, current automation revision/state, eligible report types/details, selected season/date bounds, AO scope, local channel identity and bot posting access. Reject foreign/shared Slack Connect destinations and DMs; V1 destinations are supported public local channels; private-channel reporting is not enabled by adding private AO scopes. An automation is region-owned, not a personal `/me` job: persisted admin authorization is for its exact configuration and never authorizes entry mutations or cross-region reads. Subsequent configuration edits require a current designated admin; workers obtain a trusted server-side read-only context from persisted tenant/automation identity, not client-supplied region IDs.

AUTO-10: Scheduled delivery is an **explicitly configured channel-publication path**, distinct from manual reports' private-by-default/Share flow. Enabling an automation authorizes its recurring channel posts; do not ask a PAX to click Share for each run. It is independent of `automaticBackblastRepliesEnabled`, which controls Backblast replies only. Missing setup, revoked installation, inaccessible channel or invalid report configuration blocks delivery with a visible admin status/error; never fall back to another channel or partial configuration.

AUTO-11: Generate all sections of a run from the same complete season scoring generation/read snapshot. During recalculation, defer delivery instead of publishing known-stale standings as current. A deferred run is still subject to the season cutoff and current automation state; it may be skipped rather than sent after expiration. Display automation name, season/date interval, section scopes, intended schedule time, generated-at time and row range/total as appropriate. By default combine selected sections into one bounded Slack message. If only a configured top N fits, label it explicitly; offer an intentional action to view full results privately rather than dumping unbounded pages into the channel. Do not notify/mention every PAX as a side effect of listing their names.

AUTO-12: Persist schedules, next-run state, run occurrences and outbox work in MongoDB. Use expiring leases and a unique tenant/automation/scheduled-occurrence key so multiple replicas/restarts do not intentionally post the same occurrence twice. Bind jobs to a configuration revision; pause/archive/edit invalidates old pending work, and a worker must recheck before posting. Two separately configured automations are independent even when due in the same channel at the same time. Follow the existing uncertain-Slack-response reconciliation policy: a remote timeout cannot be honestly described as a guaranteed exactly-once post. Retain sent message references/status for repair and never blindly repost uncertain outcomes.

AUTO-13: Confirmed downtime policy: coalesce missed occurrences into at most the latest eligible occurrence per automation, clearly labeled if late; do not flood channels with a backlog. Expired-season occurrences are skipped permanently. Retry transient failures with bounded backoff only while the occurrence is still eligible and configuration remains enabled. Expose last success/failure, next eligible run, skipped/expired reasons and run history in admin Home. A process restart or new replica must not reset automation progress. Channel API permission/rate-limit errors must not change competition entries.

## Data, interfaces and ownership

Reporting owns these collections and the admin panel/dispatcher handlers; foundation supplies generic leased-job/outbox and runtime adapters. This extends the approved reporting capability without a new module.

| Collection | Required fields |
|---|---|
| `reportAutomations` | Tenant keys, automationId, name, seasonId, report sections/type/detail/scope/row-limit configs, channelId, frequency, weekly weekday if applicable, localTime, timezone, state, version, next eligible occurrence, created/updated admin/time |
| `reportAutomationRuns` | Tenant keys, automationId, scheduled local occurrence/resolved UTC instant, configuration version, report snapshot/scoring generation reference, leased/due/deferred/sent/skipped/failed/uncertain state, attempts, message reference, timestamps/error reason |
| Configuration audit | Automation ID, actor/time, before/after version and activation/pause/archive history; retain independently of entry revisions |

`ReportTypeDefinition` declares stable type ID/title, allowed detail fields, supported scopes, renderer and automation eligibility; `personal-results` is explicitly false, while every other supported report is required to be eligible. A report snapshot used by scheduled rendering is bound to the automation/run and verified destination, not an arbitrary user response URL.

Use a unique tenant/automation ID and unique tenant/automation/occurrence key, plus an indexed due-run query. Details and report type IDs must come from the validated report registry. Do not retain personal OAuth tokens or user response URLs as scheduling credentials.

```text
listAutomatableReportTypes(context) → ReportTypeDefinition[]
previewAutomation(context, proposedConfiguration) → AutomationPreview
saveAutomation(context, configuration, expectedVersion, operationKey) → ReportAutomation
setAutomationState(context, automationId, state, expectedVersion, operationKey) → ReportAutomation
listAutomationRuns(context, automationId, cursor) → AdminRunPage
dispatchDueReports(trustedRuntimeContext, now) → DispatchSummary
```

## Acceptance criteria

- AUTO-A1: An admin independently configures an AO daily report and a region weekly composite report; each renders only its selected details in its selected channel, at its own intended local time.
- AUTO-A2: The catalog includes every supported report except `/me`, including `cold-entry-leaderboard`; forged personal/foreign-AO/foreign-channel configurations fail at save and dispatch. A non-admin cannot activate/edit/pause reports.
- AUTO-A3: Season selection defaults to the actual configured current season, persists its ID and never rolls over. Future-season schedules wait for their start; past-season enabling is rejected.
- AUTO-A4: Test an end-date daily/weekly occurrence, the exact next-day cutoff, timezone offsets/DST, shortened/extended season dates and retries crossing the cutoff. No new post is initiated after the bound season ends.
- AUTO-A5: Pause/archive/edit, incomplete setup, disabled/revoked installation, shared/inaccessible channels, process restart, concurrent replicas and duplicate queue deliveries cannot bypass authorization or deliver obsolete occurrences.
- AUTO-A6: Backblast replies OFF does not stop enabled report automations or manual reporting. Locked-season reports run only through the bound end date and keep recorded scores; recalculation defers open-season reports without mixed results.
- AUTO-A7: AO reports show full AO totals plus mandatory AO/region point columns from their respective entry scopes; regional patch status is clearly distinct, top-N truncation is labeled and multi-section reports share a consistent read generation.
- AUTO-A8: Missed runs coalesce without backlog spam, failed/uncertain deliveries are visible/recoverable and run leases/history survive restart. Adding a future non-`me` report requires catalog/automation coverage.

- AUTO-A9: Scheduled cold-entry output uses the same ≤32°F distinct-entry counts as manual reporting, independent of scoring points. Verify same-day multiple entries, 32/33°F boundaries, shared ties, AO scope/context and catalog inclusion; schedule/current-season/end-cutoff behavior is unchanged.

## Boundaries and open defaults

Admin-configured recurring delivery is authorized V1 scope. Never schedule personal `/me` reports, cross-region destinations, automatic season rollover or deliveries beyond the bound season. The one-late-catch-up policy is confirmed. DST resolution, one-channel-per-automation and bounded top-N rendering remain proposed implementation defaults for review.

## Implementation task links

See [the complete issue index](implementation-tasks.md) and [execution plan](../../tasks/plan.md). The links below map this document’s requirements to implementation and verification work; they do not change requirement semantics or imply completion.

| Task / issue | Scope | Requirements / acceptance cases |
|---|---|---|
| [T36 #42](https://github.com/abobwhite/f3-yeti-man/issues/42) | Report AO totals with each PAX's AO and regional points | AUTO-05 |
| [T38 #44](https://github.com/abobwhite/f3-yeti-man/issues/44) | Rank PAX by number of entries at 32°F or lower | AUTO-03, AUTO-04, AUTO-05 |
| [T45 #53](https://github.com/abobwhite/f3-yeti-man/issues/53) | Persist validated report automation definitions and report eligibility | AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05 |
| [T46 #54](https://github.com/abobwhite/f3-yeti-man/issues/54) | Configure and preview multiple automated reports in admin Home | AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05, AUTO-09, AUTO-10 |
| [T47 #55](https://github.com/abobwhite/f3-yeti-man/issues/55) | Compute timezone-aware daily and weekly occurrences within season dates | AUTO-06, AUTO-07, AUTO-08 |
| [T48A #56](https://github.com/abobwhite/f3-yeti-man/issues/56) | Claim persisted due report occurrences with cross-instance leases | AUTO-09, AUTO-12 |
| [T48B #57](https://github.com/abobwhite/f3-yeti-man/issues/57) | Coalesce missed schedules and invalidate obsolete queued runs | AUTO-07, AUTO-08, AUTO-12, AUTO-13 |
| [T49 #58](https://github.com/abobwhite/f3-yeti-man/issues/58) | Render selected automated report sections from one scoring snapshot | AUTO-03, AUTO-04, AUTO-05, AUTO-11 |
| [T50 #59](https://github.com/abobwhite/f3-yeti-man/issues/59) | Deliver scheduled channel posts with final authorization and cutoff checks | AUTO-07, AUTO-09, AUTO-10, AUTO-11, AUTO-12, AUTO-13 |
| [T51 #60](https://github.com/abobwhite/f3-yeti-man/issues/60) | Show automation progress, run history and repair guidance to admins | AUTO-01, AUTO-12, AUTO-13 |
| [C6 #61](https://github.com/abobwhite/f3-yeti-man/issues/61) | Verify season-bounded scheduled reports across the full catalog | AUTO-A1, AUTO-A2, AUTO-A3, AUTO-A4, AUTO-A5, AUTO-A6, AUTO-A7, AUTO-A8, AUTO-A9 |
