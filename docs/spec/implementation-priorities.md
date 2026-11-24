# Implementation priorities — V1

Status: user-directed priority order. This records product sequencing, not approval to start implementation or a replacement for the linked technical plan/GitHub task list.

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

These priorities sequence delivery within the existing modules; they do not rename modules, remove accepted V1 scope, alter the metric definitions or authorize deployment. The [implementation plan](../../tasks/plan.md) and [issue-linked tasks](implementation-tasks.md) trace work/checkpoints to these six priorities and record prerequisite work explicitly.

## Linked milestone checkpoints

| Priority | Required exit checkpoint |
|---|---|
| 1 | [C1 #16](https://github.com/abobwhite/f3-yeti-man/issues/16) |
| 2 | [C2 #24](https://github.com/abobwhite/f3-yeti-man/issues/24) |
| 3 | [C3 #28](https://github.com/abobwhite/f3-yeti-man/issues/28) |
| 4 | [C4 #36](https://github.com/abobwhite/f3-yeti-man/issues/36) |
| 5 | [C5 #52](https://github.com/abobwhite/f3-yeti-man/issues/52) |
| 6 | [C6 #61](https://github.com/abobwhite/f3-yeti-man/issues/61) |
| Final rollout readiness | [C7 #62](https://github.com/abobwhite/f3-yeti-man/issues/62) |

See [the task index](implementation-tasks.md) for individual issues and direct dependencies; do not use technical module order to override this delivery order.
