# Decisions and review register — V1

Status: proposed specification, based on the completed user interview. The user approved intent and the five-module capability map. This file distinguishes confirmed requirements from reviewable defaults; it is not a new interview gate for every technical choice.

## Confirmed by the user

| ID | Decision |
|---|---|
| D01 | Node.js Slack app named F3 Yeti Man; specification saved in this repository under `/docs/spec` |
| D02 | Default dates are December 1 through February's final day, now admin-configurable per D18; whole actual Fahrenheit temperatures remain -40 through 120 |
| D03 | Original bands are per-region defaults; D20 permits admin changes. Multiple referenced workouts per day award independently; distinct positive-point dates count once |
| D04 | Patch at **40 points or more**, correcting the initial wording |
| D05 | Any workspace PAX may submit or modify; retain original/latest attribution |
| D06 | Editable prefilled date/time/temperature/attendance; AO fixed in AO channels and required/configured-select elsewhere |
| D07 | Year-round historical entry/correction until admin lock; designated admins can lock and unlock |
| D08 | Installer initially a Yeti Man admin; admins configured per workspace |
| D09 | Manual competition entry reused when its referenced workout's Backblast arrives; matching reference AO/date/time preserves saved values |
| D10 | Multiple Qs supported; matching Preblast can supply time, AO schedule is fallback; posting order is unreliable |
| D11 | PAX rank by points then days, ties share rank; AO rank by total attendee points |
| D12 | Manual reports private by default; explicit Share to channel. D26 authorizes separately configured recurring channel reports |
| D13 | Admin Slack Home configuration; each AO independently configures days and start times per day |
| D14 | Multi-workspace/multi-region isolation with no cross-region reporting; MongoDB/NoSQL preference; Docker with serverless assessment |
| D15 | Approved modules: workspace-foundation, entry-ledger, entry-capture, f3-ingestion, reporting |
| D16 | Designated admins can archive an erroneous competition entry; preserve the record and history rather than hard-delete it |
| D17 | Entry is the app-owned domain entity; workouts belong to the official F3 Nation app. Slack Preblasts/Backblasts provide references, prefills and capture triggers; V1 has no direct F3 Nation integration. Direct integration is a desired future capability |
| D18 | Admin-configurable inclusive season dates, defaulting to December 1 through the final February day; supports pre-official-date testing and other regional intervals |
| D19 | Admin must complete required configuration before capture; all non-configuration slash commands return errors listing missing settings until setup is ready |
| D20 | Per-region initial scoring defaults remain supplied values; admins can edit/add/remove nonoverlapping temperature bands and integer points at any time; six is not fixed |
| D21 | Admin automatic Backblast-reply toggle defaults ON; OFF suppresses that feature only, preserving otherwise configured manual entry |
| D22 | Implement in TypeScript with a balanced typechecking baseline, not plain JavaScript |
| D23 | Local development/integration tests support ephemeral MongoDB and an optional local Docker MongoDB replica set |
| D24 | PAX are workout attendees with stored Slack IDs; AO means Area of Operation and is a required entry reference |
| D25 | Scoring changes recalculate existing entries in open seasons after admin impact review; locked seasons preserve their recorded scores |
| D26 | Admins can configure multiple independent automated reports, each with report sections/details (all supported reports except `/me`), AO/region scope, destination channel and daily or weekly day/time schedule |
| D27 | Automated reports default to the current configured season, bind to that season and run only through its program end date; no automatic season rollover |
| D28 | AO-specific reports show total AO points across all PAX and a PAX leaderboard with each PAX's AO points beside his region-wide season points |
| D29 | Configured points are nonnegative integers; bands must cover every valid integer temperature from -40 through 120 exactly once, rejecting both gaps and overlaps |
| D30 | Designated admins can restore archived entries in unlocked seasons with confirmation and audit history; restore retains entry identity |
| D31 | Public AO channels only in V1; private AO support is deferred |
| D32 | Manual entry forms stay private; successful Save posts a durable summary in the selected AO channel and gives the submitter private confirmation/link |
| D33 | Modify for every saved entry opens a private editor while its public committed summary stays visible; initial Backblast capture remains inline in the thread |
| D34 | Save/credit identifiable PAX despite unresolved FNGs/visitors, with a clear warning and no provisional points; add a valid local Slack identity later via Modify in an unlocked season |
| D35 | Reject entries before the referenced workout start instant, even when that date is within the configured season |
| D36 | After an outage, send at most one clearly labeled late catch-up for the latest missed occurrence per automation, only before the bound season ends |
| D37 | Add a PAX leaderboard by number of active entries at actual temperature ≤32°F; this is an entry count, distinct from points or qualifying days, and is an eligible non-personal automated report |
| D38 | Implementation priority: (1) manual entry capture; (2) admin configurations; (3) manual total-points leaderboard; (4) Backblast/Preblast capture and inline response; (5) other V1 work excluding scheduling; (6) scheduled reporting |
| D39 | Priority 5 includes a private admin bulk entry browser, with individual existing private-editor corrections rather than multi-entry changes |
| D40 | Browser defaults to current season, Active entries and referenced workout date/time newest first; supports past/all seasons, Active/Archived/All and reversal to oldest first |
| D41 | Admin browser supports AO, PAX or both combined; Save/Cancel preserves filters and sorting, locked seasons stay readable/read-only and existing archive/restore rules apply |
| D42 | One centrally operated service supports independent Slack workspace/region installations; Docker portability preserves a possible future self-hosting path |
| D43 | V1 production runs on DigitalOcean App Platform with managed MongoDB, initially targeting approximately USD $25/month; self-managed production servers and a separate serverless implementation are deferred |
| D44 | Initial rollout is one region, with up to about three possible; the user estimates about 500 active PAX in the described regions, roughly 2–3 Preblast/Backblast postings per day and fewer than 20 report requests per day. These are approximate forecasts, not limits; do not assume 500 per region without clarification |
| D45 | Automatic backups and tested restoration target at most 24 hours of lost changes and service recovery within one business day; these are application operating targets, not a provider SLA |
| D46 | Retain completed seasons, competition entries and audit history indefinitely; deletion requires an explicit administrative process rather than automatic season-age or uninstall deletion |
| D47 | Merges to `main` automatically deploy to production only after required checks pass; retain a tested application rollback procedure |
| D48 | Confirmed stack direction is Node.js, TypeScript, Slack Bolt and the official MongoDB driver, with a small supporting dependency set; exact versions and supporting package selections remain implementation decisions |

On 2026-11-22, D17 prompted the user-authorized terminology revision to `entry-ledger` and `entry-capture`, corresponding specification filenames, entry collections/IDs/provider methods and report labels. The approved responsibilities and dependency direction remain unchanged; the later confirmed decisions recorded above refine competition behavior. Workouts remain valid external-reference terminology, not owned entities in this app.

The user confirmed the focused follow-up interview as a whole and explicitly requested these conclusions be applied to the spec. D28–D36 supersede conflicting draft defaults. Specification review is still separate from approval to implement.

On 2026-11-23, the user confirmed the technical interview and requested its application. D42–D48 settle the service ownership, hosting, initial workload, recovery, history retention, deployment flow and core stack. The [deployment decision](deployment-options.md) records rationale, dated cost evidence and required operational verification. This confirmation does not create production resources or start implementation.

## Proposed defaults for specification review

| ID | Default | Reason / alternative |
|---|---|---|
| P01 | One region and timezone per workspace; individual workspace installs | Keeps authorization unambiguous; org-wide and multi-timezone support deferred |
| P02 | Node 24 LTS and Bolt HTTP ExpressReceiver | Core stack is confirmed by D48; runtime line/receiver remain engineering defaults, with exact tested versions pinned during implementation |
| P04 | Selected AO workout weekdays have one or more configured time defaults; other days may have none | Admin-confirmed schedule required for each active AO; multiple candidates require confirmation |
| P07 | Local active non-bot identity eligibility and retention of existing historical inactive IDs | Remaining account-eligibility detail; unresolved-attendee save/credit behavior itself is confirmed by D34 |
| P08 | `/yeti log`, `leaderboard`, `aos`, `ao`, `cold`, `me`, `help`; explicit configured-season selector (default `season:YYYY-YYYY` or custom slug) | One registration with discoverable subcommands; spellings can change during review |
| P09 | Default to configured season containing today, otherwise latest started; competition rank 1,1,3; page size 20 | Dates are configurable, not inferred from winter months; no change to ranking order |
| P10 | Draft inactivity expiry and report snapshot lifetime each 30 minutes | Bound stale state; canonical source identity remains durable |
| P11 | Yearless Preblast date inference within ±90 days of actual posting date, validated against weekday | Avoid guessing from processing date or posting order; ambiguity falls back to schedule/manual |
| P12 | Fixed AO rendered as labeled text, not a disabled input | Slack's input schema has no read-only property; server also enforces fixed AO |
| P13 | Hard deletion and entry merging remain excluded; erroneous entries use admin archiving | Updated by D16; the original proposed exclusion of all removal workflows is superseded |
| P15 | Proposed quality/load targets and coverage in SPEC-common.md | Makes robustness testable; targets require review and later measured evidence |
| P19 | Nonoverlapping explicit season intervals and stable IDs/slugs, with date edits refusing to exclude retained entries | Avoid ambiguous season assignment and silent historical disqualification |
| P20 | Region-timezone schedules; first valid time after a DST gap, first occurrence in a repeated time | DST resolution remains proposed; the one-late-catch-up behavior and season cutoff are confirmed by D36/D27 |
| P21 | One destination per automation; bounded composite message with selected fields/top-N rows and mandatory context | Independent automations support multiple channels; truncation is labeled and full results remain available on demand |

## Draft defaults resolved by the follow-up interview

| Earlier proposal ID | Confirmed resolution |
|---|---|
| P03 | D31: V1 supports public AO channels only |
| P05 | D35: future-start entries are rejected |
| P06 | D32–D33: manual/Modify forms are private; saved summaries go to the selected AO channel; initial Backblast capture stays inline |
| P16 | D30: admin Restore is supported in unlocked seasons with confirmation/audit |
| P17 | D29: complete coverage is mandatory, not optional; gaps and overlaps reject configuration |
| P18 | D29: only nonnegative integer points are allowed |
| P14 | D42–D43: one centrally operated Docker service on DigitalOcean App Platform with managed MongoDB; other production hosting paths are deferred |

## Scoring lifecycle decision — resolved

**Q02 — Resolved:** The user selected “Recalculate open seasons; preserve locked seasons” on 2026-11-23. Admins review/confirm an impact preview; the application recalculates entries in all open seasons with audited policy revisions and complete per-season publication. Locked-season scores/policy references remain unchanged. If explicitly reopened under newer rules, a season follows the previewed catch-up workflow before entry mutations resume. The previous retain-original-score alternative is superseded.

## Resolved product question

**Q01 — Erroneous competition entry: resolved.** The user requires an admin-only Archive action when a Yeti Man entry was added in error, with retained data rather than hard deletion. The spec includes archive reason/confirmation, immutable audit, exclusion from competition results, retained source identity to prevent recreation and the existing season-lock protection. Archiving an entry does not archive or cancel the referenced workout in F3 Nation. D30 confirms the complementary admin Restore action; no hard-delete workflow is authorized.

## Desired future integration

Direct F3 Nation integration is deferred from V1, not rejected. A later delta specification should establish official API/access availability, workspace/region permissions, a verified external workout identifier, supported reference-prefill use cases, provenance and reconciliation rules. Do not assume an API contract, automatically overwrite confirmed entries or introduce workout write-back. V1 keeps `entryId`, Slack message provenance and optional future external identity separate so an approved adapter can be added without changing competition ownership.

Only the rows remaining under Proposed defaults are unconfirmed engineering/operational defaults; the resolved Pxx rows above are confirmed product behavior. They can be accepted together with the specification or refined without re-running the entire interview.

## Installation and launch prerequisites

| Item | Needed before |
|---|---|
| Real trusted F3 Nation app/bot identity and anonymized raw event samples (text/blocks/edit variants) | Treating parser integration as production-ready |
| Admin-confirmed region name, IANA timezone, AO IDs/channel mappings/schedules, admins, season dates, scoring and reply mode | Activating a workspace |
| Public AO/channel access and bot membership verified; no private AO scopes | Final manifest verification and installation |
| Developer sandbox target and Slack CLI authentication | Scaffolding/installing/running, not writing these docs |
| Tested dependency/Node patch/image versions | Committing implementation lockfile/image definition |
| Operator access, billing alerts/spend cap, domain/HTTPS and DigitalOcean compute/database location; validate the approximately $25/month baseline against actual sizing | Creating production infrastructure; provider/service ownership are already selected by D42–D43 |
| Secrets provider, token-key rotation and departed-admin recovery owner | Production launch |
| Demonstrated automatic backup/restore meeting D45, named recovery owner and documented explicit administrative deletion process; uninstall revokes credentials while preserving history | Production launch; indefinite competition-history retention is confirmed by D46 |

## Current environment evidence

During this specification change, the repository had README.md and LICENSE only, with no existing app or specification system. The public Slack CLI was not detected by its documented default-path/PATH fingerprint checks; `node` and `docker` were not available on the command PATH. Python 3 was available for documentation checks. No installation or authentication was attempted, and no secret files were read. These observations do not prove the tools are absent from every version-manager environment.

Automated report scheduling is now V1 scope within the existing reporting module; prior deferred-scheduled-report language is superseded by D26–D27. Optional automation configuration is not required to activate entry capture. Definitions and detailed acceptance criteria are in [automated-reports.md](automated-reports.md).

The user's priority order is normative for the future implementation plan; [implementation-priorities.md](implementation-priorities.md) records it without beginning planning or implementation. The new manual cold-entry leaderboard belongs to priority 5, not the priority-3 total-points report. Scheduled delivery/catalog completion remains priority 6.

The separate admin-browser interview is confirmed by D39–D41 and applied in [admin-entry-browser.md](admin-entry-browser.md). It is a priority-5 entry-management UI, not a scheduled-report type, bulk update capability or permission to bypass season locks.

## Remaining operational details

Hosting, indefinite competition-history retention and recovery targets are resolved. Before launch, record the actual DigitalOcean location/plan, operator and recovery contacts, secret/encryption-key storage and recovery, alert destinations, explicit deletion procedure and restore-drill results. Select exact dependency versions and a supported image registry/CI integration during implementation. These are implementation/launch details, not a request to reopen the confirmed architecture. Routine supporting packages do not need individual interview approval.

## Review and next phase

Approve or revise these module specifications and defaults, and the remaining proposed operational/engineering defaults. Required configuration is detailed in [the shared configuration contract](configuration-contract.md). Q01 and Q02 are resolved by D16 and D25; neither needs to be asked again. The user-requested technical implementation plan and discrete verified GitHub tasks are now linked below. Implementation begins with the explicitly requested create-slack-app workflow, starting with prerequisite/CLI detection and workspace authentication; creating the backlog does not itself start app implementation.

## Implementation backlog

On 2026-11-23, the user requested GitHub issues with implementation details, linked dependencies and reverse links in the specification. The [plan](../../tasks/plan.md) and [spec task index](implementation-tasks.md) record 54 implementation issues, 7 verification checkpoint issues and 79 explicit dependency edges. All 224 numbered requirements/acceptance cases are mapped; issue creation does not mark any capability implemented or authorize infrastructure rollout. GitHub Issues is the task list target rather than a duplicate local todo checklist.
