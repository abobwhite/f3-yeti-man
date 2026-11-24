# Spec: Reporting — V1

Module id: `reporting`. Status: proposed. Depends on: `entry-ledger`.
Inherits [the common contract](SPEC-common.md).

## Objective

Give PAX trustworthy standings and personal progress with workspace-only access, understandable rank ties, deliberate manual sharing and admin-configured season-bounded scheduled channel reports.

## Commands

Enforce the common setup gate before every reporting/help command; incomplete setup returns only a private list of missing admin settings. Reporting is independent of the automatic Backblast-reply toggle.

One Slack slash command registration, `/yeti`, routes these subcommands:

| Invocation | Result |
|---|---|
| `/yeti leaderboard` | PAX season leaderboard |
| `/yeti cold` | PAX leaderboard by number of active entries at actual temperature ≤32°F |
| `/yeti aos` | Region-wide AO season leaderboard |
| `/yeti ao chuckletown` | Chuckletown total points plus PAX leaderboard with AO and regional points |
| `/yeti me` | Requesting PAX's results and entry history |
| `/yeti leaderboard season:2026-2027` | PAX standings for an explicit season |
| `/yeti aos season:2026-2027` | AO standings for that season |
| `/yeti me season:2026-2027` | Personal results for that season |
| `/yeti cold season:2026-2027` | ≤32°F entry-count standings for the selected season |

Selectors also support arbitrary configured season slugs such as `season:test-nov-2026`, not just year pairs.

An optional season picker in the private result can replace typing the selector. Reject invalid selectors explicitly rather than silently reporting another season. `/yeti help` explains all commands. Exact subcommand spellings are proposed usability defaults, not additional Slack registrations.

REPORT-01: Default to the configured season whose inclusive dates contain region-local today; otherwise use the most recently started configured season. If no season has started, show the configured upcoming seasons and ask for explicit selection. Never infer eligibility from calendar months or create a season by reporting. Show selector/label, actual date interval, region, timezone, lock state, policy context and generated-at time. Reject unknown selectors explicitly; empty configured seasons return helpful empty results. Past open and locked seasons remain reportable after required setup.

## Metrics and ranking

REPORT-02: For each PAX, sum `pointsPerPax` over distinct saved entries with `status: active` containing his Slack user ID. Qualifying days are distinct `workoutReference.localDate` values on active positive-point entries for that PAX, across all AOs in that season. Active zero-point entries count in entry history/competition-attendance counts, not qualifying days. Archived entries, unsaved/cancelled drafts and pending ingestion never count. All competition metrics and participant eligibility in REPORT-03 through REPORT-05 use active entries only. Reports describe Yeti Man participation, not a complete catalog of official workouts or F3 Nation attendance.

REPORT-03: Sort PAX by total points descending, then qualifying days descending. Equal points and days share rank. Proposed tie numbering is competition ranking (1, 1, 3); alphabetical label then stable user ID provides deterministic presentation within a tied rank, not an extra tiebreaker. Each row shows rank, Slack display name/mention, points, qualifying days and patch earned/pending. Include anyone with a saved attendance, including zero-point participants; do not enumerate every workspace member with no attendance.

REPORT-04: AO points equal the sum of `pointsPerPax × distinct attendee count` for each active entry whose `workoutReference.aoId` identifies that AO. Sort totals descending; equal totals share rank. Show AO name, entry points, active-entry count and total competition-attendance instances for context; the counts do not break ties. Two 2-point attendees contribute 4 AO points. A PAX can contribute to several AOs independently. Include inactive AOs with active entries and optionally show configured AOs with zero entries as zero, clearly labeled. Entry count is the number of recorded competition entries, not a query of official F3 Nation workout totals.

REPORT-05: Personal results are for the invoking actor in V1: points, qualifying days, active-entry attendance count, current PAX rank, patch earned at ≥40, and `max(0, 40 - points)` points remaining. Provide paginated entry history with referenced workout date/time/timezone, AO, actual temperature, awarded points and a link to the entry summary where accessible. Include zero-point entries. Do not let the command spoof another user's identity. General leaderboard viewing is available to all local PAX. No report reads or synchronizes the official F3 Nation workout store.

REPORT-06: Resolve current labels from local Slack user IDs, with a stored safe display label/user-ID fallback if lookup fails. A rename never creates another competitor; two identical display names remain distinct users. Deactivated users retain their credited historical entries. A departed user may be labeled accordingly; do not delete his points or transfer them to someone with the same name.

## Consistency and delivery

REPORT-07: Aggregate through the ledger's tenant-scoped read provider using one consistent database snapshot per generated report. Never query by region display name, take a client-supplied tenant key, or aggregate across installations. Both rankings and metrics on a report use the same committed view. Refresh after a correction yields replacement totals. No authoritative materialized totals in V1.

REPORT-08: For manual slash-command reports, respond ephemerally to the requester by default. Include “Share to channel” only when the current conversation is a supported local channel and the actor/bot have appropriate access. The action publishes a **new** message to the invoking channel; an ephemeral message cannot be converted to a public one. Revalidate current membership, tenant and Slack Connect restrictions when clicked. Never accept an arbitrary channel ID from a manipulated button. [Slack response visibility](https://docs.slack.dev/interactivity/handling-user-interaction/)

REPORT-09: Share the exact private report snapshot/page the user reviewed, including generated-at time and pagination/summary context, rather than quietly regenerating a different leaderboard under the same button. Store a short-lived server-side snapshot keyed to tenant, requester, allowed channel and opaque report ID. Proposed lifetime: 30 minutes, after which refresh is required. If refreshed data is desired, the user explicitly refreshes before sharing. Sharing from an app DM requires an explicit local-channel selection and confirmation, or is unavailable in V1; do not choose an AO destination automatically.

REPORT-10: Paginate large lists with a proposed page size of 20, within current Slack block/text limits. Show row range/total, and maintain tied rank numbering across pages. Signed/opaque cursors bind to tenant, actor, season, query and report snapshot. Private pagination must not replace a shared snapshot. Shared pages are labeled as a page, not presented as the complete standings; personal history sharing summarizes only the reviewed page. Avoid notifications to every PAX when displaying a large leaderboard; labels may be plain text while maintaining stable identity internally.

REPORT-11: Acknowledge before expensive aggregation, then deliver the result privately. Cache/snapshot storage is scoped to tenant and season/version, with bounded lifetime. Expired responses prompt re-invocation; do not rely on long-lived response URLs. Slack/DB failures produce private retry guidance and no partial totals labeled as final. Repeated Share actions with the same operation key do not intentionally spam the channel; uncertain remote-post outcomes follow the foundation's outbox/reconciliation policy.

REPORT-12: After archive (or restoration), newly generated reports reflect only the current active records, including PAX/AO points, distinct qualifying days, all attendance/entry counts, ranks and patch eligibility. Exclude archived entries from normal personal entry history; admin archive inspection is a separate labeled view. Invalidate affected season caches and unshared report snapshots on archive/restore: a stale Share action requires refresh and review rather than silently sharing pre-archive totals or regenerating a different snapshot. Previously published reports remain historical, timestamped snapshots; a newly requested report is authoritative for current standings.

REPORT-13: Read entry points/policy references from the season's fully published scoring generation. During recalculation, label the last complete generation as pending/stale and disable Share until publication completes. On publication, invalidate affected report snapshots/caches and require review of refreshed results. Never rescore locked seasons with the latest regional policy at query time; their final generation remains authoritative. Previously shared, timestamped reports remain historical snapshots.

## Admin-configured automated delivery

REPORT-14: Include [the automated-report contract](automated-reports.md) in V1. Admins may configure multiple independent daily/weekly report automations with selected details, included report types, region/AO scopes and destination channels. Default season selection to the actual current configured season and pin that season's ID. Stop delivery at its program end date, including delayed jobs/retries. Every supported report except personal `/me` must be available through the same report registry. Scheduled delivery is explicitly authorized by enabled admin configuration, not by a requester clicking Share on each run.

REPORT-15: AO-specific results (also AUTO-05) include the full AO total across all credited PAX, plus a PAX leaderboard whose required columns are PAX identity, points at this AO and total points across all AOs in the same region/season. Rank the points leaderboard by AO points, then AO qualifying days, using the existing shared-rank convention; regional points are comparison context, not a different sort. The distinct cold-entry report in REPORT-18 ranks by its entry-count metric instead, retaining the AO total and point-comparison context when AO-scoped. Compute AO totals before pagination/top-N limits so they include all active entries/PAX at that AO, not just displayed rows. Use one consistent read snapshot for both AO and regional figures. AO-only points never determine a separate patch award; any patch status remains explicitly regional. This applies to manual, shared and automated AO reports.

REPORT-16: Register the automation management Home panel and due-run handlers through the composition root. Persist report definitions/runs and use foundation's leased-job/outbox runtime rather than a memory-only cron timer. The selected always-running App Platform container must support due-report wakeups without incoming Slack activity; a separate serverless runtime is deferred. The Backblast-reply toggle and entry season locks do not disable otherwise valid read-only schedules; setup, recalculation freshness, destination authorization and season bounds still apply.

REPORT-17: Register `ao-results` as a supported report, selectable in automations and invokable through `/yeti ao <configured-AO>`. Existing AO-scoped PAX/AO leaderboard requests resolve to this same AO-results contract instead of producing a report missing the total or comparison column. An admin may choose additional details/row limits, but cannot remove the mandatory AO total or either point column from AO-specific output. Region-wide PAX/AO leaderboards retain their existing definitions. Validate local AO identity and reject ambiguous/foreign selectors; channel destination never silently changes scope.

REPORT-18: Add `cold-entry-leaderboard`, manually invokable with proposed spelling `/yeti cold` and selectable for scheduled delivery when priority 6 is implemented. For each identified PAX, count distinct active season entry IDs that contain his Slack ID and whose actual `temperatureF <= 32`. The inclusive threshold is **32°F**, independent of configurable scoring bands or awarded points: an eligible 32°F entry counts even if the admin assigns it zero points, and a 33°F entry never counts even if it awards points. Count entries, not distinct dates: two separate eligible entries on one day count twice. Duplicate attendance IDs/save retries count once per entry; drafts, archived entries and unresolved attendees contribute nothing. PAX with active attendance but no cold entries can appear with a zero count under the existing participant-list convention.

REPORT-19: Sort the cold-entry leaderboard by that count descending. Equal counts share rank; use label then Slack ID for deterministic display within a tie, not points/days as an unrequested tiebreaker. Show rank, PAX and “Entries at ≤32°F” as required fields, with optional season points/days/patch context. Support the same season selection, private-by-default response, deliberate sharing and region isolation as other reports. Region scope counts all regional AOs. Optional `ao:<configured-AO>` scope counts only entries at that AO; retain the AO's total points and mandatory AO/region point columns, add the cold-entry count and rank by that AO's cold-entry count rather than silently returning a points-sorted table. This distinct count metric does not change the total-points leaderboard's ranking, positive-point qualifying-day definition or patch eligibility.

REPORT-20: Entry archive/restore, attendance changes, temperature corrections crossing 32°F and date/AO corrections update the count report through the normal consistent snapshot/invalidation path. Scoring-policy-only changes do not change its temperature-based counts, although optional point columns may change. Treat it as a normal supported non-personal report in the registry with manual/shared/automated renderers; execution scheduling remains priority 6. Implement the manual total-points leaderboard at priority 3 and this new leaderboard at priority 5, following [the implementation priorities](implementation-priorities.md).

## Interfaces, style and structure

Use the ledger's typed report queries or constrained snapshot adapter for competition reads. The ledger owns MongoDB pipelines, mandatory tenant/season/active predicates and published-scoring-generation resolution; reporting never bypasses it with raw collections or arbitrary pipeline input. The ledger decodes aggregation results with Zod before returning plain typed results. All metrics for one report use the same committed snapshot. Reporting owns module-local official-driver repositories and Zod document schemas for its snapshots, automation configuration and delivery state under the [common persistence contract](SPEC-common.md#persistence-and-runtime-validation).

```text
buildPaxLeaderboard(context, season, page, scope = region) → PrivateReportSnapshot
buildColdEntryLeaderboard(context, season, page, scope = region) → PrivateReportSnapshot
buildAoLeaderboard(context, season, page, scope = region) → PrivateReportSnapshot
buildAoResults(context, season, aoId, page) → PrivateReportSnapshot
buildPersonalResults(context, season, page) → PrivateReportSnapshot
shareReport(context, reportId, operationKey) → ShareReceipt
listReportTypes(context) → ReportTypeDefinition[]
previewAutomation(context, proposedConfiguration) → AutomationPreview
saveAutomation(context, configuration, expectedVersion, operationKey) → ReportAutomation
dispatchDueReports(trustedRuntimeContext, now) → DispatchSummary
```

`reportSnapshots` owns ephemeral display snapshots and allowed destinations, not source-of-truth scores. It includes tenant keys, requesting actor, report query, generated-at time, source revision/watermark, rows and expiry. Use SPEC-common.md's injected providers, code style and `src/modules/reporting/` structure.

## Testing strategy and success criteria

Future check: `npm run test:module -- reporting`, then `npm run check`.

- REPORT-A1: Known data yields exact points, distinct positive-point days, attendance totals and patch eligibility at 39/40/41.
- REPORT-A2: A two-AO same-date fixture distinguishes accumulated points from qualifying days and aggregate AO attendance points.
- REPORT-A3: Shared ties, deterministic order, rank across pages, zero-point participants and empty seasons behave as specified.
- REPORT-A4: Date/temperature/attendance/AO corrections replace results; lock does not suppress reading; display-name changes do not merge identities.
- REPORT-A5: Manual reports stay private until explicit Share; sharing creates a new correctly labeled message in the allowed local channel only.
- REPORT-A6: Forged snapshot/cursor IDs, expired snapshots, foreign channels and Slack Connect sharing are denied without foreign data disclosure.
- REPORT-A7: Concurrent edits cannot produce a report combining incompatible snapshots; repeated refresh/share never changes authoritative records.
- REPORT-A8: Archiving removes every competition contribution, including zero-point entry counts. Test same-day remaining positive workouts, patch eligibility falling below 40, a PAX with only archived attendance, stale Share rejection and restoration recovering totals exactly once.
- REPORT-A9: Aggregation groups entry IDs and nested workout-reference fields; labels/counts describe competition entries and never claim to be the official F3 Nation workout or attendance record.

- REPORT-A10: Default/custom/same-year testing intervals select correctly; setup errors gate reporting before configuration. OFF affects no report. Results retain policy provenance and locked scores when regional scoring settings change; confirmed changes recalculate open seasons after admin impact review, including points, qualifying days, ranks and patch status.

- REPORT-A11: A score change causing positive/zero transitions recalculates days, ties, PAX/AO totals and patch status in open seasons only. Reports expose no mixed generation or stale Share path during retries; locked reports retain original scores even after regional policy edits.

- REPORT-A12: AUTO-A1 through AUTO-A9 pass, proving independent admin-configured schedules/details/channels, AO scoping, registry eligibility excluding `/me`, pinned seasons, cutoff enforcement and durable delivery on both runtime paths.

- REPORT-A13: AO output always includes the total across all credited PAX and side-by-side AO/region points, even with top-N rows. Verify a PAX with 4 AO/20 region points ranks above one with 2 AO/100 region points, and both regional columns include other AOs in the same season only. Manual/shared/automated views use the same result and exclude archived entries.

- REPORT-A14: Cold-entry counts include exactly 32°F and colder, exclude 33°F, count two eligible same-date entries twice and deduplicate attendance/save retries. Zero awarded points at ≤32°F still count; positive points at >32°F do not. Equal counts share rank regardless of total points or days.
- REPORT-A15: Count standings change correctly after archive/restore, attendee addition/removal, crossing-threshold temperature correction and date/AO changes; policy-only changes leave counts unchanged. Foreign tenants, unresolved identities and cancelled drafts never contribute.
- REPORT-A16: Manual/shared/scheduled catalog definitions include `cold-entry-leaderboard` with mandatory count labels and season context. AO scope uses local cold counts without losing mandatory AO-total/local-and-regional-point context. Registry/scheduler delivery does not pull the new manual report ahead of priority 5 or scheduled features ahead of priority 6.

## Boundaries

Always show season and snapshot context. Admin-configured automated channel reports are authorized scope; keep them separate from manual private-report sharing. Ask before cross-region rankings or personal-history access for other users. Never convert a private result into a recurring report without admin configuration, automate `/me`, deliver outside the bound season or use display names as grouping keys.

## Out of scope (deferred)

CSV exports, national comparisons, prize selection/fulfillment, and shared interactive dashboards.

## Open questions

Confirm proposed command names, competition-rank numbering, season default, snapshot lifetime and initial page size through the main specification review. These do not alter the user-confirmed scoring order. The additional scheduling DST and rendering defaults are identified in automated-reports.md.

## Implementation task links

See [the complete issue index](implementation-tasks.md) and [execution plan](../../tasks/plan.md). The links below map this document’s requirements to implementation and verification work; they do not change requirement semantics or imply completion.

| Task / issue | Scope | Requirements / acceptance cases |
|---|---|---|
| [T19B #22](https://github.com/abobwhite/f3-yeti-man/issues/22) | Publish complete scoring generations with consistent read semantics | REPORT-13 |
| [T21 #25](https://github.com/abobwhite/f3-yeti-man/issues/25) | Provide consistent tenant-scoped report reads and season resolution | REPORT-01, REPORT-02, REPORT-06, REPORT-07, REPORT-10, REPORT-11, REPORT-12, REPORT-13 |
| [T22 #26](https://github.com/abobwhite/f3-yeti-man/issues/26) | Show the private total-points PAX leaderboard | REPORT-02, REPORT-03, REPORT-06, REPORT-10, REPORT-11 |
| [T23 #27](https://github.com/abobwhite/f3-yeti-man/issues/27) | Share only a reviewed report snapshot to an authorized channel | REPORT-08, REPORT-09, REPORT-10, REPORT-11, REPORT-12, REPORT-13 |
| [C3 #28](https://github.com/abobwhite/f3-yeti-man/issues/28) | Verify manual points leaderboard and deliberate sharing | REPORT-A1, REPORT-A2, REPORT-A5, REPORT-A6, REPORT-A7, REPORT-A8, REPORT-A9, REPORT-A10 |
| [T31 #37](https://github.com/abobwhite/f3-yeti-man/issues/37) | Archive and restore entries through the audited ledger lifecycle | REPORT-12, REPORT-20 |
| [T35 #41](https://github.com/abobwhite/f3-yeti-man/issues/41) | Report the regional AO points leaderboard | REPORT-04, REPORT-06, REPORT-07, REPORT-10, REPORT-12, REPORT-13 |
| [T36 #42](https://github.com/abobwhite/f3-yeti-man/issues/42) | Report AO totals with each PAX's AO and regional points | REPORT-15, REPORT-17 |
| [T37 #43](https://github.com/abobwhite/f3-yeti-man/issues/43) | Show personal season results and paginated entry history | REPORT-05, REPORT-06, REPORT-10, REPORT-12, REPORT-13 |
| [T38 #44](https://github.com/abobwhite/f3-yeti-man/issues/44) | Rank PAX by number of entries at 32°F or lower | REPORT-18, REPORT-19, REPORT-20 |
| [T39 #45](https://github.com/abobwhite/f3-yeti-man/issues/45) | Complete command help, season selectors and report discoverability | REPORT-01, REPORT-17, REPORT-19 |
| [C5 #52](https://github.com/abobwhite/f3-yeti-man/issues/52) | Verify the complete non-scheduled V1 feature set | REPORT-A3, REPORT-A4, REPORT-A9, REPORT-A10, REPORT-A12, REPORT-A14, REPORT-A15, REPORT-A16 |
| [T45 #53](https://github.com/abobwhite/f3-yeti-man/issues/53) | Persist validated report automation definitions and report eligibility | REPORT-14, REPORT-16, REPORT-17, REPORT-20 |
| [T46 #54](https://github.com/abobwhite/f3-yeti-man/issues/54) | Configure and preview multiple automated reports in admin Home | REPORT-14, REPORT-16 |
| [T48A #56](https://github.com/abobwhite/f3-yeti-man/issues/56) | Claim persisted due report occurrences with cross-instance leases | REPORT-16 |
| [T49 #58](https://github.com/abobwhite/f3-yeti-man/issues/58) | Render selected automated report sections from one scoring snapshot | REPORT-14, REPORT-15, REPORT-17, REPORT-20 |
| [C6 #61](https://github.com/abobwhite/f3-yeti-man/issues/61) | Verify season-bounded scheduled reports across the full catalog | REPORT-A11, REPORT-A12, REPORT-A13, REPORT-A14, REPORT-A15, REPORT-A16 |
