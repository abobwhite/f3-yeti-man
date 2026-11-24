# Implementation priorities — V1

Status: user-directed priority order. This records product sequencing, not approval to start implementation or a replacement for the later technical plan/task list.

| Priority | Capability | Scope |
|---|---|---|
| 1 | Manual entry capture | Private manual entry/Modify, required AO/PAX references, validation, persistence, duplicate protection and saved AO-channel summaries |
| 2 | Admin configurations | Complete the admin setup/configuration experience: region/timezone, AOs/schedules, competition dates, scoring and its application, designated admins, season controls and Backblast-reply settings |
| 3 | Manual leaderboard reporting — most total points | Deliver the manually invoked region PAX leaderboard ranked by season total points, with its agreed qualifying-day tiebreaker and private response/sharing |
| 4 | Backblast/Preblast capture and inline response | Trusted Slack reference ingestion/matching, capture triggers, inline initial thread form, saved summary and private subsequent Modify |
| 5 | Everything else except scheduled reports | Remaining V1 capabilities, including the sortable/filterable admin entry browser with individual private edits, the ≤32°F entry-count leaderboard, manual AO standings/results, personal results, and any remaining archive/restore/admin-operation workflows |
| 6 | Scheduled reporting features | Multiple admin-configured report automations, report/detail/scope/channel selection, daily/weekly scheduling, durable execution, catch-up and season-end cutoff |

## Dependencies do not change the priority order

Use the capability map for technical provider dependencies, not as permission to finish every foundation/admin feature before starting manual capture. Implement only the minimal foundation/ledger/typed interfaces needed by priority 1, then complete the admin configuration capability at priority 2. Early capture work can be verified with isolated test fixtures/providers while its production setup gate remains closed.

No priority waives mandatory setup, tenant isolation, AO references, Slack identity, valid scoring/date configuration, current lock checks or duplicate prevention. Live entry capture is usable only with the required admin-confirmed configuration; if priority 1 is exercised live before the complete priority-2 UI, it needs a minimal legitimate admin setup path. Never bypass readiness with client flags, implicit defaults or production-only test fixtures just to claim manual capture is ready.

Likewise, the point leaderboard at priority 3 uses the configured ledger and must not wait for automatic ingestion, the new count leaderboard or scheduling infrastructure. Define reusable report/registry contracts as needed, but do not build scheduled execution ahead of priorities 4–5. Full automation catalog coverage is accepted with priority 6, so earlier manual-report delivery does not depend on scheduled-report completion.

The full admin entry browser is a priority-5 capability, not part of the priority-2 configuration UI or a prerequisite to the basic priority-1 individual editor. It reuses those editor/provider contracts when delivered; scheduled reporting remains last.

These priorities sequence delivery within the existing modules; they do not rename modules, remove accepted V1 scope, alter the metric definitions or authorize deployment. The later implementation plan must trace its work/checkpoints to these six priorities and record prerequisite work explicitly.
