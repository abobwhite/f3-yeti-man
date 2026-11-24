# F3 Yeti Man — V1 specification

Status: proposed; intent and capability map approved, module specifications awaiting review.
Prepared: 2026-11-21. This directory is the specification entry point.
Domain terminology revised: 2026-11-22. Admin configuration, TypeScript and local database requirements revised: 2026-11-23. The subsequent focused interview decisions are applied throughout; see D28–D36 in the decision register.
Technical interview applied: 2026-11-23; confirmed hosting, operations and stack direction are recorded as D42–D48.

## Objective

Make the regional Yeti Man competition (December–February by default) easy to record and fair to report inside each F3 region's Slack workspace. PAX confirm actual starting temperature and attendance, earning points for cold-weather workouts. Region administrators configure AOs and close completed seasons. The app supports multiple workspace installations without cross-region access.

F3 describes its community around fitness, fellowship, faith, and outdoor, peer-led workouts. This app supports that context; the competition rules below come from the user, not an inferred national F3 policy. [F3 Nation](https://f3nation.com/)

## Domain and ownership

The primary domain entity is a **Yeti Man entry**: a region/season-scoped competition record for one referenced workout, containing the confirmed temperature, PAX attendance and resulting points. An entry covers the attendee list together; it is not a separately submitted entry per PAX. Multiple attendees derive their individual credit from that one entry.

The **workout** is an external entity stored in the official F3 Nation app. F3 Yeti Man owns entries and their lifecycle, not the workout catalog, workout scheduling or official F3 attendance. Each entry retains a `workoutReference` snapshot of the AO, workout date/start time/timezone and available descriptive context needed for scoring and duplicate detection. Correcting or archiving an entry changes Yeti Man competition data only; it does not modify, cancel or archive the official workout.

**Preblasts and Backblasts** are Slack messages about that external workout. In V1 they supply reference evidence and candidate prefills: a Backblast triggers entry capture, while a matching Preblast can supply start time. Source-message identity, local entry identity and an official workout ID are different concepts. V1 does not require or invent an official workout ID and does not directly call or synchronize with the F3 Nation app.

Direct F3 Nation integration is a desired future capability, deferred from V1. Preserve structured reference/provenance data and an optional verified external reference so a future adapter can associate entries with official workouts without replacing entry IDs or bypassing entry validation, season locks and region isolation. Availability of an official integration API is not assumed.

**PAX** is a workout attendee. Store each attending PAX's Slack user ID on the entry alongside the workspace/region context for later lookup, correction and possible F3 integration. Display names are labels, never substitutes for stored identity. **AO** means **Area of Operation**. Every entry must reference a configured AO in its own region; no entry may exist without `workoutReference.aoId`.

## Read this specification

| Document | Purpose |
|---|---|
| [Capability map](capability-map.md) | Approved module boundaries and technical dependency direction |
| [Implementation priorities](implementation-priorities.md) | User-specified six-priority delivery order, with prerequisite safeguards |
| [Admin configuration contract](configuration-contract.md) | Required setup gate, configurable season dates/scoring, automatic-reply toggle |
| [Common contract](SPEC-common.md) | Stack, commands, structure, style, quality, security and boundaries inherited by every module |
| [Workspace foundation](SPEC-workspace-foundation.md) | Installations, region configuration, AO schedules, persistence and runtime |
| [Entry ledger](SPEC-entry-ledger.md) | Competition entries, external workout references, scoring, audit and season locking |
| [Entry capture](SPEC-entry-capture.md) | Private manual/Modify editors, initial inline capture and saved summaries |
| [Admin entry browser](admin-entry-browser.md) | Priority-5 admin bulk listing with sorting/filtering and individual private edits |
| [F3 Slack ingestion](SPEC-f3-ingestion.md) | Slack reference-message parsing/matching and entry-capture triggers; no direct F3 integration |
| [Reporting](SPEC-reporting.md) | Points/cold-entry standings, AO comparisons, private reports, sharing and automation providers |
| [Automated reports](automated-reports.md) | Multiple admin-configured daily/weekly channel reports, AO scopes and season cutoff |
| [Deployment decision](deployment-options.md) | Confirmed DigitalOcean hosting, budget, automatic deployment, recovery and history retention; deferred alternatives |
| [Decisions and open questions](decisions-and-open-questions.md) | Confirmed decisions, proposed defaults and deployment prerequisites |
| [Source evidence](source-evidence.md) | External constraints and user-provided sample evidence |

Every `SPEC-<module-id>.md` inherits SPEC-common.md. Supporting documents do not create additional modules. Requirements use stable IDs for review and future tests. These are requirements and interface contracts, not an implementation plan or task list.

## Confirmed product rules

- Admins configure inclusive competition start/end dates per region/season. December 1 through February's last day, including leap day, is the default suggestion; earlier testing and other regional date ranges are supported.
- Temperature is the actual starting temperature, not wind chill; integer Fahrenheit from -40 through 120 inclusive.
- An active entry awards points for its distinct referenced workout, including multiple workouts on the same date. Qualifying days count distinct workout-local dates with at least one positive-point attendance on an active entry.
- **A total of 40 or more points earns the patch.** This supersedes the initial request's wording of more than 40.
- Any PAX in the installed workspace may save or modify records. Show who originally submitted and who last modified each record.
- Date and start time are prefilled where possible and editable. Temperature and attendance are editable. AO is fixed in an AO channel and selectable elsewhere.
- Backblast prompts mention all identified Qs. The person saving may be someone other than those Qs.
- A late Backblast reuses a manual entry matched by its workout reference's AO, date and start time, preserving the entry's saved attendance and temperature.
- Historical entries and corrections are allowed until a designated region admin locks the season. Only those admins may unlock it.
- Admins must configure and confirm required region/timezone/AO schedules/season/scoring settings before capture. Every non-configuration slash command fails privately with the actual missing settings until setup is complete; `/yeti configure` and admin Home remain available.
- PAX ranking: points descending, then qualifying days descending; equal values share rank. Regional AO ranking uses total points at each AO. An AO-specific report shows its total points across all PAX and a PAX leaderboard with AO points beside region-wide season points; rank the AO table by AO points/days.
- The cold-entry leaderboard ranks PAX by number of distinct active entries at actual temperature ≤32°F. It counts entries rather than dates, independently of configured point awards; it is also selectable for automated reports when scheduling is delivered.
- Manual reports are private to the requester by default, with explicit Share to channel. Admins can separately configure multiple automated channel reports, choosing supported report sections/details (excluding `/me`), AO/region scope, channel and daily/weekly day/time. Each automation defaults to the current season, binds to it and stops at its program end date.
- No cross-workspace/region reporting, identity merging or attendance credit.
- Manual capture and all Modify editors are private. Successful manual Save publishes the summary in the selected AO channel with private confirmation/link; initial Backblast capture stays inline. Public saved summaries remain visible unchanged during edits.
- V1 supports public AO channels only. Future-start entries are rejected. Identifiable PAX can be credited while unresolved attendees are warned/uncredited, then added later by Slack ID in an unlocked season.
- Designated Yeti Man admins can archive a competition entry added in error. Archiving preserves its data and audit history while excluding it from competition results; it is never a hard delete and cannot bypass a season lock. Admins can explicitly restore it in an unlocked season, with confirmation and audit history.

- Admins can change nonnegative integer scoring points/bounds and add/remove bands at any time; six bands is not a fixed limit. The ranges must cover every valid temperature exactly once; gaps and overlaps both reject configuration. The supplied scoring table is the per-region default.
- Scoring edits recalculate existing entries in open seasons after admin impact review. Locked seasons retain their scores; an explicit unlock under newer rules previews catch-up before further edits.
- `automaticBackblastRepliesEnabled` defaults ON. Admins may turn it OFF without disabling otherwise configured manual entry, explicit message actions or reports.
- Application source is TypeScript with a balanced compiler baseline. Local development/integration tests support ephemeral MongoDB and a Docker MongoDB replica set.

- At priority 5, admins can privately browse current/past/all-season entries, filter by AO/PAX or both and Active/Archived/All, and reverse newest-first workout date/time sorting. They edit entries individually while retaining filters/sort; locked seasons remain read-only.

## Confirmed technical direction

- One centrally operated service supports independent, isolated workspace/region installations. Core stack: Node.js, TypeScript, Slack Bolt and the official MongoDB driver, with a small supporting dependency set.
- Production uses Docker on DigitalOcean App Platform with managed MongoDB, initially targeting approximately USD $25/month across the initial installations. Actual sizing/cost and transaction support must be verified; the baseline is not highly available.
- Initial forecast: one to approximately three regions, about 500 active PAX in the described regions, roughly 2–3 Preblast/Backblast postings per day and fewer than 20 daily report requests. The PAX figure is not confirmed as a per-region count; forecasts are not capacity limits.
- Automatic backups and tested restoration target no more than 24 hours of lost changes and recovery within one business day. These are operating targets, not a provider SLA.
- Retain seasons, entries, revisions and audit history indefinitely, including archived records and history after uninstall. Temporary operational state can still expire safely. Exceptional deletion needs an explicit administrative process; no entry hard-delete feature is added.
- Merges to `main` deploy automatically after required checks pass. Retain a tested application rollback procedure without automatic database rollback.
- Self-managed production servers and a separate serverless implementation are deferred. Docker portability remains required. Detailed decisions and launch verification are in [deployment-options.md](deployment-options.md).

## Implementation priorities

1. Manual entry capture.
2. Admin configurations.
3. Manual leaderboard reporting ranked by most total points.
4. Backblast/Preblast capture and inline response.
5. All other V1 work except scheduled reporting, including the new ≤32°F entry-count leaderboard and admin entry browser.
6. Scheduled reporting features.

Technical prerequisites do not change this feature ordering, and required admin setup cannot be bypassed to release capture earlier. [Priority details](implementation-priorities.md) distinguish minimal prerequisite work from full capability delivery. This records sequencing only; implementation still follows specification review and a subsequent plan.

## Default scoring

| Starting temperature °F, inclusive | Points per attendee |
|---|---:|
| 33–120 | 0 |
| 26–32 | 1 |
| 19–25 | 2 |
| 11–18 | 3 |
| 1–10 | 4 |
| -40–0 | 5 |

Admins review these seeded defaults before activation and may replace them with a validated table. Custom band counts and nonnegative integer point values are supported; input validity remains whole Fahrenheit from -40 to 120. Negative/fractional points, gaps and overlaps reject configuration. Invalid input is rejected, never silently scored zero. After admin impact review, scoring changes recalculate all open seasons; locked seasons retain their recorded scores. Recalculation updates points, qualifying days, ranks and patch eligibility with preserved audit history.

## V1 acceptance walkthrough

1. Install into two isolated workspaces. Before setup, verify `/yeti log`, reports and help return missing-settings errors while `/yeti configure` works. Admins then confirm different regions, AO schedules, dates and scoring. The examples below use the default dates/table.
2. Receive a trusted Backblast in a configured `ao-` channel. Post one thread form with known AO, date, matching Preblast time or schedule fallback, blank temperature and editable Backblast PAX.
3. Save an entry for a 20°F workout with two attendees. Each earns 2 points, the AO earns 4, and each PAX gains one qualifying day.
4. Save an entry for another 20°F workout that day at a different AO for one attendee. He now has 4 points and one qualifying day.
5. Modify either a manual or Backblast-linked entry in a private editor while the public summary stays visible. Save replaces its totals; Cancel changes no saved/public state. Manual initial capture stays private and posts its saved summary only in the selected AO channel.
6. Log manually, then receive its Backblast. Keep one entry and preserve saved values.
7. Show points, days, patch eligibility and correct ties privately; an AO report includes its full total and each PAX's AO/region point columns. Share deliberately to a permitted channel in the same workspace.
8. At 40 points, show patch earned. Lock the season: reject every later entry mutation, including stale forms and queued work. Unlock as a designated admin and allow corrections again.
9. Attempt forged IDs, foreign users, foreign channel shares and foreign-workspace records; deny without revealing their contents.
10. Archive an erroneous entry as a designated admin in an open season. Preserve the entry, source links and audit history; remove its contributions from PAX/AO totals, qualifying days and patch eligibility. A normal PAX, stale editor or replayed Backblast cannot reactivate it. A locked season rejects archiving.

11. Configure a pre-December test interval and a table with a different number of nonoverlapping bands; verify capture/points follow that region's settings. Reject overlapping bands and dates excluding retained entries.
12. Turn automatic replies OFF: no new or queued unsolicited Backblast reply is initiated, while manual entry still works. Verify both local DB modes and TypeScript checks.

13. Change a scoring policy after impact review. Verify all open seasons are recalculated, locked scores remain unchanged, cancelled/stale previews change nothing and interrupted work resumes without mixed standings.

14. Configure an AO daily report and independent full-region weekly composite report in different channels, each with selected details and the current season. Verify `/me` cannot be selected and delayed/retried runs stop at that season's inclusive end date.

15. Save for known PAX with an unresolved-attendee warning, then add the newly identified Slack user to that same unlocked entry. Reject future starts, private AOs and invalid scoring gaps/negative points. Restore an archived entry as an admin without changing identity or duplicating credit.
16. Recover missed schedules with one labeled latest catch-up per automation at most; never replay a backlog or initiate it after season end.

17. Request the cold-entry leaderboard: two ≤32°F entries on the same day count as two; 32°F counts, 33°F does not, and scoring-policy-only edits do not change counts. Confirm it appears in the eligible scheduled-report catalog when priority 6 is delivered.

18. As an admin, open the current-season Active browser newest-workout-first; reverse order, combine AO/PAX filters, inspect past/all seasons and archived entries. Edit one entry privately and return with query controls preserved. Confirm locked rows are read-only and that an entry leaving the filters after a correction is clearly explained.

19. Prove that failing checks block production promotion, a passing merged revision deploys automatically to App Platform and the previous application image can be restored without reverting competition data.
20. Restore a managed-database backup in isolation, verify tenant/lock/audit/transaction invariants and record compliance with the 24-hour data-loss and one-business-day recovery targets. Confirm that uninstall disables credentials/work while retaining competition history.

## Delivery boundary

This change writes specification documents only. No app has been created, installed, run or deployed. Proposed npm/Docker commands describe the future implementation contract; no package scripts or containers exist yet. Planning, scaffolding and implementation follow review of these documents.
