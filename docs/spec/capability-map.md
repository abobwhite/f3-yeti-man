# Capability map: F3 Yeti Man

Status: approved by user on 2026-11-21.
Entry module names updated at the user's request on 2026-11-22; responsibilities and dependency direction remain unchanged. The ledger and capture modules manage competition entries; workouts belong to the external F3 Nation app.

| Module id | Responsibility | Depends on |
|---|---|---|
| `workspace-foundation` | Installation, region isolation, admins, required-setup gate, scoring policy configuration, reply toggle, AO schedules, MongoDB, deployment | — |
| `entry-ledger` | Competition entries and workout references, scoring, deduplication, audit, admin archiving, configurable season dates/locks | `workspace-foundation` |
| `entry-capture` | Private manual/Modify editors, initial inline Backblast capture, Save/Cancel, AO summaries and admin entry browser | `entry-ledger` |
| `f3-ingestion` | Trusted F3 Nation Slack posts as reference evidence, Preblast matching and Backblast-triggered entry capture | `entry-capture` |
| `reporting` | Points and ≤32°F entry-count leaderboards, AO totals with local/regional PAX comparison, personal results, season selection, sharing and admin-configured season-bounded report automations | `entry-ledger` |

Technical dependency order: workspace-foundation → entry-ledger → entry-capture → f3-ingestion; reporting also depends on entry-ledger. This is **not** the feature implementation priority. Follow [the user's six implementation priorities](implementation-priorities.md): manual capture → admin configurations → manual total-points leaderboard → Backblast/Preblast capture → other V1 features → scheduled reporting. Build prerequisites in the smallest necessary form without promoting an entire lower-priority capability ahead of the requested sequence.

Dependency entries imply access to underlying providers transitively. Consumers do not query another module's collections directly. Provider specifications own contracts. The composition root wires handlers and UI extensions: foundation does not import the ledger merely because a season-lock panel appears in App Home. The ledger registers that panel through foundation's extension interface.

Each module has a corresponding `SPEC-<module-id>.md` here. SPEC-common.md and the other supporting documents are shared constraints, not new modules. All module documents are proposed until human review; approval of this map is not approval of implementation.

The [implementation plan](../../tasks/plan.md) and [issue-linked task index](implementation-tasks.md) now break these modules into executable slices and verification checkpoints. GitHub Issues is the task list target; this capability map continues to define ownership, not feature priority.
