# Admin configuration and readiness contract — V1

Status: proposed specification updated from the user's requirements on 2026-11-23. This shared contract applies to every entry path, reporting command and background worker; it adds no module or dependency cycle.

## Required setup before use

CONFIG-01: A new installation is **not configured**, even though suggested season dates, default scoring bands and the automatic-reply toggle are seeded. Only a designated Yeti Man admin may review, complete and confirm setup. Defaults are per installation/region, not a shared mutable global object. Persist confirming admin, time and configuration revision.

Required valid and admin-confirmed settings:

| Setting | Readiness requirement |
|---|---|
| Region | Nonblank region name and an explicit valid IANA timezone |
| Administration | At least one designated local Yeti Man admin |
| AOs | At least one active configured **Area of Operation**, with stable local AO ID and valid local channel mapping; active AOs have their weekday/start-time defaults configured |
| Competition dates | At least one admin-confirmed season with explicit valid inclusive start/end dates in region timezone; no overlapping seasons in the region |
| Scoring | A valid, admin-confirmed versioned table of integer Fahrenheit bands and integer points, initially the supplied defaults |
| Automatic replies | Explicitly reviewed boolean `automaticBackblastRepliesEnabled`, seeded **true**; a verified trusted F3 Nation Slack source identity is additionally required when true |

Turning automatic replies OFF removes only their source-identity prerequisite; it does not remove the region/AO/date/scoring setup requirements. Installing an app or clicking a bot message cannot count as admin confirmation. A valid configured season may be in the past or future: setup readiness and whether a particular workout date belongs to an open eligible season are separate checks.

CONFIG-02: Before required setup is complete, **every non-configuration slash command** returns a private `SETUP_REQUIRED` error listing the actual missing/invalid/unconfirmed settings, who must fix them and how to open configuration. This includes `/yeti`, `log`, `leaderboard`, `aos`, `ao`, `cold`, `me`, `help`, and unknown non-configuration subcommands. Do not open a capture form, fall back to defaults or return a partial report. Example:

```text
F3 Yeti Man setup is incomplete. A Yeti Man admin must configure:
• Region timezone
• At least one AO and its workout-day/start-time defaults
• Competition start/end dates
Open the app Home tab or run /yeti configure.
```

The list is computed, not a fixed message. It contains configuration labels only, never secrets or another region's information.

CONFIG-03: `/yeti configure` is the configuration exception: admins can open the setup/admin Home path even while incomplete; non-admins receive admin-only guidance with missing setting labels. The admin Home tab also remains available. Transport challenge/health/OAuth and setup handlers are not blocked by competition readiness. Keep process/database readiness independent of tenant setup so one incomplete region cannot take other regions offline.

CONFIG-04: Apply the same readiness check before any entry draft/form/automated prompt is created and again before entry commits, modifications, archive or restore. Enforce it in providers, not only slash listeners. Stale UI and queued jobs cannot bypass changed/invalid configuration. Capture requests require a reviewed configuration revision; changes cause explicit refresh/review rather than silently applying different dates or points. Background events while incomplete may record minimal delivery/suppression metadata but cannot initiate entry capture or unsolicited setup spam.

CONFIG-05: Compute setup state from current validated configuration and admin confirmation, not a client-provided `ready` flag. Saves reject invalid settings atomically and retain the last valid configuration. Setup drafts are separate from active settings. Subsequent valid admin edits are confirmation of their resulting revision; prerequisites must hold at activation. Prevent removal of the final active AO/defaults/admin from invalidating a live region accidentally: require a valid replacement, or explicitly put the region back in setup-required state. When setup becomes incomplete, the gate is enforced again.

## Configurable competition dates

CONFIG-06: December 1 through February's final day is the **suggested default**, not a hard-coded eligibility rule. Admins configure explicit inclusive `startDate`/`endDate` for each region season, including pre-December testing dates, other month ranges, same-calendar-year seasons and single-day testing periods. Newly proposed annual seasons use December 1 to the final February day in the following year (including leap day), but must be confirmed before capture. Ending a date interval does not automatically lock it.

CONFIG-07: Use stable `seasonId` and a unique readable per-region selector/label, such as `2026-2027`, `summer-2027` or `test-nov-2026`; do not use start year as the only identity or unique key. A season's timezone is explicit and remains consistent with the region migration policy. Require real dates and `startDate <= endDate`. Reject overlap, including a shared inclusive boundary date, so a reference date resolves to at most one season. Date outside all configured intervals yields an eligibility error showing the configured intervals, not an incorrect hard-coded December–February error.

CONFIG-08: Date changes for an existing season require admin authorization, expected version, audit and the season write fence. A locked season's dates cannot change until explicitly unlocked. Expanding an open season is allowed if it does not overlap another. Reject a change that would exclude any retained entry, including archived entries; show impacted entry IDs for admin review instead of silently deleting, moving or disqualifying history. Admins can configure a new nonoverlapping testing interval or adjust an empty interval. Test entries in a live region count normally unless archived; use an isolated workspace for tests that must not affect real standings.

## Configurable temperature-to-points table

CONFIG-09: Admins can add, remove, split or change scoring bands and their **integer point values** at any time by saving a new versioned regional policy. Six bands is only the initial default, never a fixed array length or UI limit. Do not require colder temperatures to have monotonically higher points. Retain the previously specified whole-Fahrenheit input validity domain of -40 through 120; custom scoring partitions this domain rather than silently changing accepted temperature validation.

| Default inclusive minimum °F | Default inclusive maximum °F | Integer points |
|---|---|---:|
| -40 | 0 | 5 |
| 1 | 10 | 4 |
| 11 | 18 | 3 |
| 19 | 25 | 2 |
| 26 | 32 | 1 |
| 33 | 120 | 0 |

CONFIG-10: Each band has integer `minF`, `maxF` and a nonnegative safe integer `points`, with `-40 <= minF <= maxF <= 120`. Inclusive ranges **must not overlap**: `[1, 10]` and `[10, 18]` conflict at 10; `[1, 10]` and `[11, 18]` do not. Sort for validation and reject overlap regardless of entered order. Require complete coverage with no gaps over all accepted integer temperatures so every valid temperature maps to exactly one point value; show gaps for correction rather than defaulting them to zero. Reject negative or fractional points. Zero and any supported positive safe integer are allowed; do not impose the original 0–5 limits. Validate aggregate arithmetic stays within safe integer limits. Patch threshold remains 40; qualifying days require at least one positive-point attendance on an active entry.

CONFIG-11: Store immutable policy revisions (`scoringPolicyId`, revision, full bands, author/time) and persist the applicable policy reference plus derived points on every entry/revision. Editing creates a new policy; it never rewrites old policy documents. After an admin reviews and confirms an impact preview, **recalculate all existing entries in every open season in that region** under the new policy. Preserve locked-season entry scores and policy references unchanged. New regional rules can be configured without unlocking closed seasons. Q02 is resolved by this rule; retaining old scores in open seasons is not an alternative behavior.

## Automatic Backblast reply toggle

CONFIG-12: The admin-only master toggle `automaticBackblastRepliesEnabled` defaults ON per region. OFF prevents all **unsolicited Backblast-driven replies/capture requests**, including source-change/configuration notices and jobs queued before it was disabled. Workers re-read the setting immediately before an automatic post; serialize dispatch/configuration boundaries so a reply is not newly initiated after OFF has committed. A request already sent to Slack before OFF may still arrive; show that bounded in-flight limitation rather than claiming remote recall.

CONFIG-13: The toggle does not disable slash-command manual capture, explicit Save/Modify/Cancel/Archive actions on an existing entry message, manual/scheduled reports, sharing, scoring or season configuration. It is not global app enable/disable. Readiness and season locks still apply independently. Permitted passive reference parsing/caching need not stop when OFF; never require F3 source identity just for manual capture in OFF mode. Re-enabling affects newly received triggers only by default; do not flood channels by automatically replaying all messages suppressed while OFF. Admin-initiated historical backfill is still deferred.

## Applying a scoring change

CONFIG-14: Before activation, preview affected open seasons, retained/active entry counts, old/new points and totals, qualifying-day/rank/patch changes, and locked seasons explicitly excluded. Cancellation leaves active configuration and scores unchanged. Bind confirmation to the proposed policy, region/config/catalog revision and impacted season/entry revisions. Concurrent entry/date/lock/policy changes invalidate the preview; refresh it rather than applying an impact the admin did not review. Only designated admins can confirm application, with authorization checked again at commit.

CONFIG-15: Recalculation is durable, idempotent and resumable, with a visible operation ID/status. Fence affected open seasons against entry edits, archive/restore, date changes and lock changes while applying; recheck their open state when acquiring the fence. Use bounded work for large seasons rather than assuming all history fits one transaction. Stage each season's new entry scores/policy references and audit revisions, then publish a complete scoring generation atomically. Never expose a mixture of old/new scores within a season, overwrite concurrently changed facts, or change any locked season. Preserve original temperature, attendance, AO/workout reference, identity and archive status. Recalculate archived entries too for consistent potential restoration, but keep them excluded from every competition metric. Old awarded points/policy references remain inspectable in immutable audit history.

CONFIG-16: During application, block new entry commits and mutations for affected seasons with an explicit “scoring update in progress” message. Existing drafts may remain but must refresh after completion. Reports can show the last fully published generation with a conspicuous pending/stale banner, but cannot share it as current; invalidate affected caches/unshared snapshots on publication. Track per-season progress; do not declare the regional change complete until all affected open seasons have published. On failure, retain complete published generations, show pending/error state, keep unfinished seasons fenced and allow authorized retry with the same operation ID. Do not silently skip a season, claim success or release it with mixed scores. Serialize further policy activation and season creation/reopening with the operation so no open season is missed. New saves after completion use the new policy.

CONFIG-17: A locked season keeps its final scores until an admin explicitly unlocks it. If its policy differs from the current regional policy, the unlock workflow previews/asks confirmation of the catch-up impact, then records the explicit unlock and runs the same fenced recalculation before accepting entry mutations. Existing locked scores are not changed merely because another season adopts new settings. A season may be locked again only after its current-policy recalculation completes. Recalculate totals, qualifying days, ranks and patch eligibility from active entries, not only the displayed per-entry point value.

CONFIG-18: Report automations are optional admin configuration owned by reporting, not another required setup setting. An empty automation list never blocks entry capture. Activation/delivery requires the existing core setup to be complete; draft configuration and management remain available through the admin configuration surface. Automation destination/details/schedule/season are validated independently per automation. Admin confirmation of enabling authorizes its recurring channel posts, bounded by that season's dates; see [automated reports](automated-reports.md). The Backblast-reply toggle applies to none of these report runs.

## Provider boundary and checks

Foundation owns regional settings, immutable scoring policy revisions, configuration authorization and common readiness evaluation. The entry ledger owns season intervals and recalculation/published scoring generations, registering a **read-only setup check and admin panel** through composition-root extension points. The composition root wires the scoring admin form to the ledger's preview/application coordinator; foundation does not import ledger code. Saving a policy revision alone does not mark it applied: retain desired/pending versus published revision and operation state explicitly. Initial setup with no entries can confirm its initial policy without a historical recalculation. Setup-provider checks read raw validated configuration only and must not call the readiness gate recursively. Configuring seasons/admin settings is allowed while the capture gate is closed.

```text
getSetupStatus(context) → { ready, missingSettings, configurationRevision }
assertConfigured(context, expectedConfigurationRevision?) → ReadyConfiguration
registerSetupCheck(readOnlyProvider) → composition-root registration
saveScoringPolicy(context, expectedVersion, bands) → ProposedScoringPolicyRevision
setAutomaticBackblastReplies(context, enabled, expectedVersion) → RegionConfig
```

Every entry still requires a non-null, same-region configured `workoutReference.aoId`, enforced by the ledger even if submitted metadata is forged. Each PAX on the entry stores a stable Slack user identifier alongside tenant context; display labels never replace it. Test readiness and settings in two regions with different intervals, band counts/values and toggle states, plus stale UI, overlapping ranges, gaps, locked seasons and queued replies.
