# Implementation tasks — V1

Status: issue backlog created at the user’s request on 2026-11-23; implementation has not started.

GitHub Issues is the task list target. This index links the 54 implementation tasks and 7 verification checkpoints; acceptance criteria, verification commands, likely files and external prerequisites live in each issue. The [implementation plan](../../tasks/plan.md) records execution rules and risks. There is no duplicate `tasks/todo.md` checklist.

## Dependency and execution rules

- Each issue contains direct **Blocked by** and **Blocks** links in its body and matching native GitHub issue relationships. The graph has 79 edges and no cycles.
- Start a task only when its linked blockers are complete. Milestone checkpoints preserve the six user priorities; tasks at one priority with satisfied blockers may run in parallel.
- Foundation work in priority 1 is limited to the legitimate setup/isolation/ledger/runtime prerequisites for manual capture. Full admin UI is priority 2, admin entry browsing/cold-count reports are priority 5, and scheduled execution is priority 6.
- Shared composition/provider files require coordination even when the graph permits parallel work. Keep the approved module dependency direction and record any necessary task split before expanding beyond about five files.
- All tasks start open. Close them only with acceptance/verification evidence; spec requirements remain authoritative and no issue authorizes paid provisioning or posts to real Slack channels by itself.

## Milestone exits

| Priority | Checkpoint | Required result |
|---|---|---|
| 1 | [C1 #16](https://github.com/abobwhite/f3-yeti-man/issues/16) | Manual entry capture and its minimum prerequisites verified before later priorities |
| 2 | [C2 #24](https://github.com/abobwhite/f3-yeti-man/issues/24) | Complete admin configurations verified before later priorities |
| 3 | [C3 #28](https://github.com/abobwhite/f3-yeti-man/issues/28) | Manual total-points leaderboard verified before later priorities |
| 4 | [C4 #36](https://github.com/abobwhite/f3-yeti-man/issues/36) | Backblast and Preblast capture verified before later priorities |
| 5 | [C5 #52](https://github.com/abobwhite/f3-yeti-man/issues/52) | Remaining non-scheduled V1 capabilities verified before later priorities |
| 6 | [C6 #61](https://github.com/abobwhite/f3-yeti-man/issues/61) | Scheduled reporting verified before final rollout readiness |
| Launch | [C7 #62](https://github.com/abobwhite/f3-yeti-man/issues/62) | Measured hosting, regional isolation and recovery evidence |

## Priority 1

Manual entry capture and its minimum prerequisites.

### T01

**[T01 #2](https://github.com/abobwhite/f3-yeti-man/issues/2): Scaffold the official Bolt starter without overwriting repository content**

Establish the minimal non-AI Bolt HTTP starter in the existing repository using the create-slack-app workflow. The repository currently contains specifications, README, LICENSE and Git exclusions only; do not assume any app scripts or source exist.

**Blocked by:** None. **Blocks:** [T02 #3](https://github.com/abobwhite/f3-yeti-man/issues/3).

**Spec:** [SPEC-common.md](SPEC-common.md): `COMMON-03`; [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-12`.

### T02

**[T02 #3](https://github.com/abobwhite/f3-yeti-man/issues/3): Convert the starter to the balanced TypeScript build contract**

Replace the template runtime source with compiled TypeScript and establish the production entrypoint/module conventions before adding features.

**Blocked by:** [T01 #2](https://github.com/abobwhite/f3-yeti-man/issues/2). **Blocks:** [T03 #4](https://github.com/abobwhite/f3-yeti-man/issues/4).

**Spec:** [SPEC-common.md](SPEC-common.md): `COMMON-04`.

### T03

**[T03 #4](https://github.com/abobwhite/f3-yeti-man/issues/4): Provide the test, coverage, lint and module-check scripts**

Make the common verification commands executable with the Node built-in runner and starter-compatible formatting. Feature tasks add their meaningful tests alongside behavior.

**Blocked by:** [T02 #3](https://github.com/abobwhite/f3-yeti-man/issues/3). **Blocks:** [T04 #5](https://github.com/abobwhite/f3-yeti-man/issues/5), [T08 #9](https://github.com/abobwhite/f3-yeti-man/issues/9).

**Spec:** [SPEC-common.md](SPEC-common.md): `COMMON-01`, `COMMON-03`.

### T04

**[T04 #5](https://github.com/abobwhite/f3-yeti-man/issues/5): Support real ephemeral and Docker MongoDB integration modes**

Provide the official-driver connection lifecycle and two transaction-capable local MongoDB modes, shared by development and integration tests.

**Blocked by:** [T03 #4](https://github.com/abobwhite/f3-yeti-man/issues/4). **Blocks:** [T05 #6](https://github.com/abobwhite/f3-yeti-man/issues/6), [T09 #10](https://github.com/abobwhite/f3-yeti-man/issues/10).

**Spec:** [SPEC-common.md](SPEC-common.md): `COMMON-02`, `COMMON-04`; [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-A5`, `FOUND-A9`.

### T05

**[T05 #6](https://github.com/abobwhite/f3-yeti-man/issues/6): Persist encrypted multi-workspace OAuth installations**

Implement Bolt HTTP ExpressReceiver OAuth v2 using a persistent custom installation store and external token-encryption key material.

**Blocked by:** [T04 #5](https://github.com/abobwhite/f3-yeti-man/issues/5). **Blocks:** [T06 #7](https://github.com/abobwhite/f3-yeti-man/issues/7).

**Spec:** [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-01`, `FOUND-02`, `FOUND-13`.

### T06

**[T06 #7](https://github.com/abobwhite/f3-yeti-man/issues/7): Enforce signed tenant, member and destination authorization**

Create the mandatory trusted WorkspaceContext and permission providers used by every module. Business handlers receive verified context rather than client-selected tenant IDs.

**Blocked by:** [T05 #6](https://github.com/abobwhite/f3-yeti-man/issues/6). **Blocks:** [T07 #8](https://github.com/abobwhite/f3-yeti-man/issues/8), [T09 #10](https://github.com/abobwhite/f3-yeti-man/issues/10), [T10 #11](https://github.com/abobwhite/f3-yeti-man/issues/11).

**Spec:** [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-03`, `FOUND-04`, `FOUND-11`, `FOUND-A1`, `FOUND-A2`.

### T07

**[T07 #8](https://github.com/abobwhite/f3-yeti-man/issues/8): Build the leased durable-operation and message-outbox runtime**

Supply generic persisted work, expiring leases and safe Slack delivery for capture now and ingestion/reporting later. This task does not implement scheduled-report execution early.

**Blocked by:** [T06 #7](https://github.com/abobwhite/f3-yeti-man/issues/7). **Blocks:** [T11 #12](https://github.com/abobwhite/f3-yeti-man/issues/12).

**Spec:** [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-04`; [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-13`.

### T08

**[T08 #9](https://github.com/abobwhite/f3-yeti-man/issues/9): Implement configurable scoring and workout-reference validation**

Implement pure competition rules for integer Fahrenheit, configured scoring tables, required AO/PAX reference facts and timezone-aware workout start instants.

**Blocked by:** [T03 #4](https://github.com/abobwhite/f3-yeti-man/issues/4). **Blocks:** [T09 #10](https://github.com/abobwhite/f3-yeti-man/issues/10), [T10 #11](https://github.com/abobwhite/f3-yeti-man/issues/11).

**Spec:** [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-02`, `LEDGER-03`, `LEDGER-04`, `LEDGER-05`; [configuration-contract.md](configuration-contract.md): `CONFIG-09`, `CONFIG-10`.

### T09

**[T09 #10](https://github.com/abobwhite/f3-yeti-man/issues/10): Persist seasons and enforce transactional season write fences**

Provide stable explicit seasons and mutation fences before capture. Include only the admin provider/minimal setup hooks now; the complete Home panel arrives at priority 2.

**Blocked by:** [T04 #5](https://github.com/abobwhite/f3-yeti-man/issues/5), [T06 #7](https://github.com/abobwhite/f3-yeti-man/issues/7), [T08 #9](https://github.com/abobwhite/f3-yeti-man/issues/9). **Blocks:** [T10 #11](https://github.com/abobwhite/f3-yeti-man/issues/11).

**Spec:** [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-01`, `LEDGER-13`, `LEDGER-14`, `LEDGER-15`, `LEDGER-16`; [configuration-contract.md](configuration-contract.md): `CONFIG-06`, `CONFIG-07`, `CONFIG-08`.

### T10

**[T10 #11](https://github.com/abobwhite/f3-yeti-man/issues/11): Provide the required setup gate and minimal legitimate admin setup**

Enable real manual capture only after an admin confirms the essential region/AO/season/scoring configuration, without front-loading the complete priority-2 configuration UI.

**Blocked by:** [T06 #7](https://github.com/abobwhite/f3-yeti-man/issues/7), [T08 #9](https://github.com/abobwhite/f3-yeti-man/issues/9), [T09 #10](https://github.com/abobwhite/f3-yeti-man/issues/10). **Blocks:** [T11 #12](https://github.com/abobwhite/f3-yeti-man/issues/12).

**Spec:** [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-05`, `FOUND-06`, `FOUND-07`, `FOUND-08`, `FOUND-09`; [configuration-contract.md](configuration-contract.md): `CONFIG-01`, `CONFIG-02`, `CONFIG-03`, `CONFIG-04`, `CONFIG-05`; [SPEC-common.md](SPEC-common.md): `COMMON-05`.

### T11

**[T11 #12](https://github.com/abobwhite/f3-yeti-man/issues/12): Save versioned entries atomically with duplicate and retry protection**

Implement saveEntry/getEntry/findByWorkoutReference providers as the sole competition-write boundary, with initial current-policy score projections that can later support staged recalculation.

**Blocked by:** [T07 #8](https://github.com/abobwhite/f3-yeti-man/issues/8), [T10 #11](https://github.com/abobwhite/f3-yeti-man/issues/11). **Blocks:** [T12 #13](https://github.com/abobwhite/f3-yeti-man/issues/13).

**Spec:** [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-06`, `LEDGER-07`, `LEDGER-09`, `LEDGER-10`, `LEDGER-11`, `LEDGER-12`, `LEDGER-15`; [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-07`, `CAPTURE-14`.

### T12

**[T12 #13](https://github.com/abobwhite/f3-yeti-man/issues/13): Publish version-aware saved entry summaries through the outbox**

Turn committed entries into durable Slack views without coupling message success to competition credit.

**Blocked by:** [T11 #12](https://github.com/abobwhite/f3-yeti-man/issues/12). **Blocks:** [T13 #14](https://github.com/abobwhite/f3-yeti-man/issues/14).

**Spec:** [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-08`, `CAPTURE-13`; [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-A8`.

### T13

**[T13 #14](https://github.com/abobwhite/f3-yeti-man/issues/14): Capture manual entries in private Slack forms**

Deliver /yeti and /yeti log as the first complete feature: private inputs, validated Save, one durable entry and its selected-AO summary.

**Blocked by:** [T12 #13](https://github.com/abobwhite/f3-yeti-man/issues/13). **Blocks:** [T14 #15](https://github.com/abobwhite/f3-yeti-man/issues/15).

**Spec:** [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-01`, `CAPTURE-02`, `CAPTURE-03`, `CAPTURE-04`, `CAPTURE-05`, `CAPTURE-06`, `CAPTURE-07`, `CAPTURE-10`, `CAPTURE-11`, `CAPTURE-14`.

### T14

**[T14 #15](https://github.com/abobwhite/f3-yeti-man/issues/15): Modify entries privately without replacing the committed public view**

Reuse the private editor for any authorized PAX modifying a saved manual or source-linked entry while retaining the public committed summary.

**Blocked by:** [T13 #14](https://github.com/abobwhite/f3-yeti-man/issues/14). **Blocks:** [C1 #16](https://github.com/abobwhite/f3-yeti-man/issues/16).

**Spec:** [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-09`, `CAPTURE-10`, `CAPTURE-11`, `CAPTURE-12`; [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-10`, `LEDGER-12`.

### C1

**[C1 #16](https://github.com/abobwhite/f3-yeti-man/issues/16): Verify the complete manual-entry milestone**

Close the first user-priority milestone with recorded integration/sandbox evidence. This is a verification issue, not permission to start priority-2 features or production provisioning.

**Blocked by:** [T14 #15](https://github.com/abobwhite/f3-yeti-man/issues/15). **Blocks:** [T15 #17](https://github.com/abobwhite/f3-yeti-man/issues/17), [T16 #18](https://github.com/abobwhite/f3-yeti-man/issues/18), [T17 #19](https://github.com/abobwhite/f3-yeti-man/issues/19), [T18 #20](https://github.com/abobwhite/f3-yeti-man/issues/20).

**Spec:** [SPEC-common.md](SPEC-common.md): `COMMON-01`, `COMMON-03`, `COMMON-05`; [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-A2`, `CAPTURE-A3`, `CAPTURE-A4`, `CAPTURE-A5`, `CAPTURE-A6`, `CAPTURE-A9`, `CAPTURE-A10`, `CAPTURE-A11`, `CAPTURE-A12`, `CAPTURE-A13`; [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-A1`, `LEDGER-A2`, `LEDGER-A3`, `LEDGER-A4`, `LEDGER-A5`, `LEDGER-A6`, `LEDGER-A7`, `LEDGER-A8`, `LEDGER-A12`, `LEDGER-A13`.

## Priority 2

Complete admin configurations.

### T15

**[T15 #17](https://github.com/abobwhite/f3-yeti-man/issues/17): Manage region settings, designated admins and reply mode in App Home**

Expand the minimal setup experience into the full region/admin settings panel without importing downstream module implementations.

**Blocked by:** [C1 #16](https://github.com/abobwhite/f3-yeti-man/issues/16). **Blocks:** [T20 #23](https://github.com/abobwhite/f3-yeti-man/issues/23), [T30 #35](https://github.com/abobwhite/f3-yeti-man/issues/35).

**Spec:** [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-05`, `FOUND-09`, `FOUND-10`; [configuration-contract.md](configuration-contract.md): `CONFIG-05`, `CONFIG-12`, `CONFIG-13`.

### T16

**[T16 #18](https://github.com/abobwhite/f3-yeti-man/issues/18): Configure independent AO channels and weekday time schedules**

Provide finite region-owned AO administration and per-day/multiple-start-time defaults used by entry capture.

**Blocked by:** [C1 #16](https://github.com/abobwhite/f3-yeti-man/issues/16). **Blocks:** [C2 #24](https://github.com/abobwhite/f3-yeti-man/issues/24).

**Spec:** [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-07`, `FOUND-08`, `FOUND-09`, `FOUND-11`.

### T17

**[T17 #19](https://github.com/abobwhite/f3-yeti-man/issues/19): Manage configurable season dates and lock controls in App Home**

Expose the existing season/fence providers as a registered admin Home panel, including explicit date editing and lock/unlock previews.

**Blocked by:** [C1 #16](https://github.com/abobwhite/f3-yeti-man/issues/16). **Blocks:** [T20 #23](https://github.com/abobwhite/f3-yeti-man/issues/23).

**Spec:** [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-01`, `LEDGER-13`, `LEDGER-14`, `LEDGER-16`; [configuration-contract.md](configuration-contract.md): `CONFIG-06`, `CONFIG-07`, `CONFIG-08`.

### T18

**[T18 #20](https://github.com/abobwhite/f3-yeti-man/issues/20): Preview versioned scoring-policy changes and affected open seasons**

Create immutable proposed policies and a reviewable impact preview without prematurely activating or recalculating them.

**Blocked by:** [C1 #16](https://github.com/abobwhite/f3-yeti-man/issues/16). **Blocks:** [T19A #21](https://github.com/abobwhite/f3-yeti-man/issues/21).

**Spec:** [configuration-contract.md](configuration-contract.md): `CONFIG-09`, `CONFIG-10`, `CONFIG-11`, `CONFIG-14`; [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-A10`; [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-21`.

### T19A

**[T19A #21](https://github.com/abobwhite/f3-yeti-man/issues/21): Stage resumable scoring-generation recalculation batches**

Apply a confirmed impact preview as a durable resumable operation that stages new score projections while preserving the last complete generation.

**Blocked by:** [T18 #20](https://github.com/abobwhite/f3-yeti-man/issues/20). **Blocks:** [T19B #22](https://github.com/abobwhite/f3-yeti-man/issues/22).

**Spec:** [configuration-contract.md](configuration-contract.md): `CONFIG-14`, `CONFIG-15`, `CONFIG-16`; [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-21`.

### T19B

**[T19B #22](https://github.com/abobwhite/f3-yeti-man/issues/22): Publish complete scoring generations with consistent read semantics**

Atomically publish each completed season calculation and expose only score projections matching the current fact version and published generation.

**Blocked by:** [T19A #21](https://github.com/abobwhite/f3-yeti-man/issues/21). **Blocks:** [T20 #23](https://github.com/abobwhite/f3-yeti-man/issues/23).

**Spec:** [configuration-contract.md](configuration-contract.md): `CONFIG-15`, `CONFIG-16`; [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-04`, `LEDGER-21`; [SPEC-reporting.md](SPEC-reporting.md): `REPORT-13`.

### T20

**[T20 #23](https://github.com/abobwhite/f3-yeti-man/issues/23): Wire scoring review, progress and unlock catch-up into admin flows**

Complete policy activation UX and explicit outdated-policy season reopening using the staged coordinator, without silently migrating history.

**Blocked by:** [T15 #17](https://github.com/abobwhite/f3-yeti-man/issues/17), [T17 #19](https://github.com/abobwhite/f3-yeti-man/issues/19), [T19B #22](https://github.com/abobwhite/f3-yeti-man/issues/22). **Blocks:** [C2 #24](https://github.com/abobwhite/f3-yeti-man/issues/24).

**Spec:** [configuration-contract.md](configuration-contract.md): `CONFIG-11`, `CONFIG-14`, `CONFIG-16`, `CONFIG-17`; [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-17`; [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-13`, `LEDGER-21`.

### C2

**[C2 #24](https://github.com/abobwhite/f3-yeti-man/issues/24): Verify complete admin configuration and scoring lifecycle**

Verify the second-priority milestone before manual leaderboard work; retain the completed manual-entry behavior.

**Blocked by:** [T16 #18](https://github.com/abobwhite/f3-yeti-man/issues/18), [T20 #23](https://github.com/abobwhite/f3-yeti-man/issues/23). **Blocks:** [T21 #25](https://github.com/abobwhite/f3-yeti-man/issues/25).

**Spec:** [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-A3`, `FOUND-A4`, `FOUND-A6`, `FOUND-A7`, `FOUND-A8`, `FOUND-A10`; [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-A14`, `LEDGER-A15`, `LEDGER-A16`, `LEDGER-A17`.

## Priority 3

Manual total-points leaderboard.

### T21

**[T21 #25](https://github.com/abobwhite/f3-yeti-man/issues/25): Provide consistent tenant-scoped report reads and season resolution**

Implement the shared read/snapshot contract needed by the first manual points leaderboard, without building scheduled execution early.

**Blocked by:** [C2 #24](https://github.com/abobwhite/f3-yeti-man/issues/24). **Blocks:** [T22 #26](https://github.com/abobwhite/f3-yeti-man/issues/26).

**Spec:** [SPEC-reporting.md](SPEC-reporting.md): `REPORT-01`, `REPORT-02`, `REPORT-06`, `REPORT-07`, `REPORT-10`, `REPORT-11`, `REPORT-12`, `REPORT-13`.

### T22

**[T22 #26](https://github.com/abobwhite/f3-yeti-man/issues/26): Show the private total-points PAX leaderboard**

Deliver /yeti leaderboard ranked by season total points as the third user-priority feature.

**Blocked by:** [T21 #25](https://github.com/abobwhite/f3-yeti-man/issues/25). **Blocks:** [T23 #27](https://github.com/abobwhite/f3-yeti-man/issues/27).

**Spec:** [SPEC-reporting.md](SPEC-reporting.md): `REPORT-02`, `REPORT-03`, `REPORT-06`, `REPORT-10`, `REPORT-11`.

### T23

**[T23 #27](https://github.com/abobwhite/f3-yeti-man/issues/27): Share only a reviewed report snapshot to an authorized channel**

Implement deliberate manual sharing reusable by all later report types, keeping private and public message lifecycles distinct.

**Blocked by:** [T22 #26](https://github.com/abobwhite/f3-yeti-man/issues/26). **Blocks:** [C3 #28](https://github.com/abobwhite/f3-yeti-man/issues/28).

**Spec:** [SPEC-reporting.md](SPEC-reporting.md): `REPORT-08`, `REPORT-09`, `REPORT-10`, `REPORT-11`, `REPORT-12`, `REPORT-13`.

### C3

**[C3 #28](https://github.com/abobwhite/f3-yeti-man/issues/28): Verify manual points leaderboard and deliberate sharing**

Close the third-priority milestone without waiting for automated ingestion, count reports or scheduling.

**Blocked by:** [T23 #27](https://github.com/abobwhite/f3-yeti-man/issues/27). **Blocks:** [T24 #29](https://github.com/abobwhite/f3-yeti-man/issues/29), [T28 #33](https://github.com/abobwhite/f3-yeti-man/issues/33).

**Spec:** [SPEC-reporting.md](SPEC-reporting.md): `REPORT-A1`, `REPORT-A2`, `REPORT-A5`, `REPORT-A6`, `REPORT-A7`, `REPORT-A8`, `REPORT-A9`, `REPORT-A10`.

## Priority 4

Backblast and Preblast capture.

### T24

**[T24 #29](https://github.com/abobwhite/f3-yeti-man/issues/29): Capture verified F3 source identity and sanitized event fixtures**

Turn the provided visible examples into safe parser fixtures and obtain actual trusted Slack app/bot identifiers and raw event shapes before claiming real integration readiness.

**Blocked by:** [C3 #28](https://github.com/abobwhite/f3-yeti-man/issues/28). **Blocks:** [T25 #30](https://github.com/abobwhite/f3-yeti-man/issues/30).

**Spec:** [SPEC-f3-ingestion.md](SPEC-f3-ingestion.md): `INGEST-01`, `INGEST-03`, `INGEST-A1`, `INGEST-A2`, `INGEST-A4`, `INGEST-A9`; [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-12`.

### T25

**[T25 #30](https://github.com/abobwhite/f3-yeti-man/issues/30): Parse supported F3 Preblast and Backblast messages deterministically**

Extract structured reference candidates from verified message formats while treating their narrative content as untrusted data.

**Blocked by:** [T24 #29](https://github.com/abobwhite/f3-yeti-man/issues/29). **Blocks:** [T26 #31](https://github.com/abobwhite/f3-yeti-man/issues/31), [T27 #32](https://github.com/abobwhite/f3-yeti-man/issues/32).

**Spec:** [SPEC-f3-ingestion.md](SPEC-f3-ingestion.md): `INGEST-03`, `INGEST-04`, `INGEST-05`, `INGEST-16`.

### T26

**[T26 #31](https://github.com/abobwhite/f3-yeti-man/issues/31): Match Preblast times by workout reference rather than posting order**

Persist normalized Preblast candidates and resolve editable time prefills for the same tenant/AO/workout date, with explicit ambiguity handling.

**Blocked by:** [T25 #30](https://github.com/abobwhite/f3-yeti-man/issues/30). **Blocks:** [T29 #34](https://github.com/abobwhite/f3-yeti-man/issues/34).

**Spec:** [SPEC-f3-ingestion.md](SPEC-f3-ingestion.md): `INGEST-06`, `INGEST-07`, `INGEST-08`, `INGEST-09`.

### T27

**[T27 #32](https://github.com/abobwhite/f3-yeti-man/issues/32): Receive trusted F3 message events through a replay-safe inbox**

Add public message event subscriptions and source-verifying middleware without dropping the required third-party bot messages.

**Blocked by:** [T25 #30](https://github.com/abobwhite/f3-yeti-man/issues/30). **Blocks:** [T29 #34](https://github.com/abobwhite/f3-yeti-man/issues/34).

**Spec:** [SPEC-f3-ingestion.md](SPEC-f3-ingestion.md): `INGEST-01`, `INGEST-02`, `INGEST-12`; [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-12`.

### T28

**[T28 #33](https://github.com/abobwhite/f3-yeti-man/issues/33): Collect initial Backblast entry details inline in its thread**

Implement requestCapture as a source-idempotent initial inline form; later Modify remains private using the existing editor.

**Blocked by:** [C3 #28](https://github.com/abobwhite/f3-yeti-man/issues/28). **Blocks:** [T29 #34](https://github.com/abobwhite/f3-yeti-man/issues/34).

**Spec:** [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-02`, `CAPTURE-03`, `CAPTURE-04`, `CAPTURE-06`, `CAPTURE-10`, `CAPTURE-11`, `CAPTURE-12`, `CAPTURE-14`.

### T29

**[T29 #34](https://github.com/abobwhite/f3-yeti-man/issues/34): Reconcile Backblast capture with existing manual and archived entries**

Wire verified Backblasts through matching, canonical-source reconciliation and the capture provider without direct ledger/Slack bypasses.

**Blocked by:** [T26 #31](https://github.com/abobwhite/f3-yeti-man/issues/31), [T27 #32](https://github.com/abobwhite/f3-yeti-man/issues/32), [T28 #33](https://github.com/abobwhite/f3-yeti-man/issues/33). **Blocks:** [T30 #35](https://github.com/abobwhite/f3-yeti-man/issues/35).

**Spec:** [SPEC-f3-ingestion.md](SPEC-f3-ingestion.md): `INGEST-10`, `INGEST-11`, `INGEST-15`; [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-07`, `LEDGER-08`; [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-14`.

### T30

**[T30 #35](https://github.com/abobwhite/f3-yeti-man/issues/35): Handle source changes, reply-toggle races and uncertain thread delivery**

Make automatic replies robust to message edit/delete, queued work and toggles without rewriting confirmed competition facts.

**Blocked by:** [T29 #34](https://github.com/abobwhite/f3-yeti-man/issues/34), [T15 #17](https://github.com/abobwhite/f3-yeti-man/issues/17). **Blocks:** [C4 #36](https://github.com/abobwhite/f3-yeti-man/issues/36).

**Spec:** [SPEC-f3-ingestion.md](SPEC-f3-ingestion.md): `INGEST-13`, `INGEST-14`; [configuration-contract.md](configuration-contract.md): `CONFIG-12`, `CONFIG-13`.

### C4

**[C4 #36](https://github.com/abobwhite/f3-yeti-man/issues/36): Verify trusted source ingestion and inline capture**

Verify the fourth-priority feature with authentic sanitized payloads and isolated Slack clients, retaining manual entry/report behavior.

**Blocked by:** [T30 #35](https://github.com/abobwhite/f3-yeti-man/issues/35). **Blocks:** [T31 #37](https://github.com/abobwhite/f3-yeti-man/issues/37), [T33 #39](https://github.com/abobwhite/f3-yeti-man/issues/39), [T35 #41](https://github.com/abobwhite/f3-yeti-man/issues/41), [T37 #43](https://github.com/abobwhite/f3-yeti-man/issues/43), [T40 #46](https://github.com/abobwhite/f3-yeti-man/issues/46), [T41 #47](https://github.com/abobwhite/f3-yeti-man/issues/47).

**Spec:** [SPEC-f3-ingestion.md](SPEC-f3-ingestion.md): `INGEST-A1`, `INGEST-A2`, `INGEST-A3`, `INGEST-A4`, `INGEST-A5`, `INGEST-A6`, `INGEST-A7`, `INGEST-A8`, `INGEST-A9`, `INGEST-A10`; [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-A1`, `CAPTURE-A4`, `CAPTURE-A7`, `CAPTURE-A9`, `CAPTURE-A10`, `CAPTURE-A11`, `CAPTURE-A12`.

## Priority 5

Remaining non-scheduled V1 capabilities.

### T31

**[T31 #37](https://github.com/abobwhite/f3-yeti-man/issues/37): Archive and restore entries through the audited ledger lifecycle**

Implement admin-only soft archive/restore of one erroneous entry using the same transaction, fence, version and idempotency contracts as Save.

**Blocked by:** [C4 #36](https://github.com/abobwhite/f3-yeti-man/issues/36). **Blocks:** [T32 #38](https://github.com/abobwhite/f3-yeti-man/issues/38).

**Spec:** [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-17`, `LEDGER-18`, `LEDGER-19`, `LEDGER-20`; [SPEC-reporting.md](SPEC-reporting.md): `REPORT-12`, `REPORT-20`.

### T32

**[T32 #38](https://github.com/abobwhite/f3-yeti-man/issues/38): Expose private admin Archive and Restore confirmation flows**

Add the existing ledger's per-entry archive/restore lifecycle to authorized Slack views without creating a deletion or bulk-write path.

**Blocked by:** [T31 #37](https://github.com/abobwhite/f3-yeti-man/issues/37). **Blocks:** [T34 #40](https://github.com/abobwhite/f3-yeti-man/issues/40).

**Spec:** [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-15`, `CAPTURE-16`; [admin-entry-browser.md](admin-entry-browser.md): `BROWSE-09`.

### T33

**[T33 #39](https://github.com/abobwhite/f3-yeti-man/issues/39): Query the complete admin entry browser with stable filtered pagination**

Provide listAdminEntries for authorized cross-season browsing within one tenant; filter and order in MongoDB before returning a bounded page.

**Blocked by:** [C4 #36](https://github.com/abobwhite/f3-yeti-man/issues/36). **Blocks:** [T34 #40](https://github.com/abobwhite/f3-yeti-man/issues/40).

**Spec:** [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-22`; [admin-entry-browser.md](admin-entry-browser.md): `BROWSE-01`, `BROWSE-02`, `BROWSE-03`, `BROWSE-04`, `BROWSE-05`, `BROWSE-10`.

### T34

**[T34 #40](https://github.com/abobwhite/f3-yeti-man/issues/40): Browse and individually correct entries in private admin App Home**

Register the priority-5 admin browser via foundation's Home extension and reuse ledger queries plus the existing private single-entry editor.

**Blocked by:** [T32 #38](https://github.com/abobwhite/f3-yeti-man/issues/38), [T33 #39](https://github.com/abobwhite/f3-yeti-man/issues/39). **Blocks:** [C5 #52](https://github.com/abobwhite/f3-yeti-man/issues/52).

**Spec:** [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-18`; [admin-entry-browser.md](admin-entry-browser.md): `BROWSE-01`, `BROWSE-02`, `BROWSE-03`, `BROWSE-04`, `BROWSE-05`, `BROWSE-06`, `BROWSE-07`, `BROWSE-08`, `BROWSE-09`, `BROWSE-10`.

### T35

**[T35 #41](https://github.com/abobwhite/f3-yeti-man/issues/41): Report the regional AO points leaderboard**

Implement /yeti aos using existing season resolution, consistent reads, private pagination and deliberate sharing contracts.

**Blocked by:** [C4 #36](https://github.com/abobwhite/f3-yeti-man/issues/36). **Blocks:** [T36 #42](https://github.com/abobwhite/f3-yeti-man/issues/42).

**Spec:** [SPEC-reporting.md](SPEC-reporting.md): `REPORT-04`, `REPORT-06`, `REPORT-07`, `REPORT-10`, `REPORT-12`, `REPORT-13`.

### T36

**[T36 #42](https://github.com/abobwhite/f3-yeti-man/issues/42): Report AO totals with each PAX's AO and regional points**

Implement /yeti ao <configured-AO> and the shared composite AO result contract reused by any AO-scoped report.

**Blocked by:** [T35 #41](https://github.com/abobwhite/f3-yeti-man/issues/41). **Blocks:** [T38 #44](https://github.com/abobwhite/f3-yeti-man/issues/44).

**Spec:** [SPEC-reporting.md](SPEC-reporting.md): `REPORT-15`, `REPORT-17`; [automated-reports.md](automated-reports.md): `AUTO-05`.

### T37

**[T37 #43](https://github.com/abobwhite/f3-yeti-man/issues/43): Show personal season results and paginated entry history**

Implement /yeti me strictly for the verified invoking actor, reusing consistent reads and existing private report delivery.

**Blocked by:** [C4 #36](https://github.com/abobwhite/f3-yeti-man/issues/36). **Blocks:** [T39 #45](https://github.com/abobwhite/f3-yeti-man/issues/45).

**Spec:** [SPEC-reporting.md](SPEC-reporting.md): `REPORT-05`, `REPORT-06`, `REPORT-10`, `REPORT-12`, `REPORT-13`.

### T38

**[T38 #44](https://github.com/abobwhite/f3-yeti-man/issues/44): Rank PAX by number of entries at 32°F or lower**

Implement /yeti cold as a distinct count metric, independent of point policies and positive-day ranking.

**Blocked by:** [T36 #42](https://github.com/abobwhite/f3-yeti-man/issues/42). **Blocks:** [T39 #45](https://github.com/abobwhite/f3-yeti-man/issues/45).

**Spec:** [SPEC-reporting.md](SPEC-reporting.md): `REPORT-18`, `REPORT-19`, `REPORT-20`; [automated-reports.md](automated-reports.md): `AUTO-03`, `AUTO-04`, `AUTO-05`.

### T39

**[T39 #45](https://github.com/abobwhite/f3-yeti-man/issues/45): Complete command help, season selectors and report discoverability**

Finish discoverable /yeti command routing across all manual reports without introducing more slash command registrations.

**Blocked by:** [T37 #43](https://github.com/abobwhite/f3-yeti-man/issues/43), [T38 #44](https://github.com/abobwhite/f3-yeti-man/issues/44). **Blocks:** [C5 #52](https://github.com/abobwhite/f3-yeti-man/issues/52).

**Spec:** [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-01`; [SPEC-reporting.md](SPEC-reporting.md): `REPORT-01`, `REPORT-17`, `REPORT-19`; [configuration-contract.md](configuration-contract.md): `CONFIG-02`, `CONFIG-03`.

### T40

**[T40 #46](https://github.com/abobwhite/f3-yeti-man/issues/46): Expose privacy-safe operational health and actionable failures**

Complete observable runtime behavior for acknowledgments, durable jobs, database health and Slack API failure recovery before scheduled delivery adds load.

**Blocked by:** [C4 #36](https://github.com/abobwhite/f3-yeti-man/issues/36). **Blocks:** [C5 #52](https://github.com/abobwhite/f3-yeti-man/issues/52).

**Spec:** [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-03`, `FOUND-04`, `FOUND-14`; [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-12`, `CAPTURE-13`; [SPEC-common.md](SPEC-common.md): `COMMON-03`.

### T41

**[T41 #47](https://github.com/abobwhite/f3-yeti-man/issues/47): Build the portable production Docker image and local app stack**

Package the compiled app for App Platform while preserving a complete local Docker development path with real MongoDB transactions.

**Blocked by:** [C4 #36](https://github.com/abobwhite/f3-yeti-man/issues/36). **Blocks:** [T42 #48](https://github.com/abobwhite/f3-yeti-man/issues/48).

**Spec:** [SPEC-common.md](SPEC-common.md): `COMMON-02`, `COMMON-04`; [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-14`, `FOUND-A5`, `FOUND-A11`.

### T42

**[T42 #48](https://github.com/abobwhite/f3-yeti-man/issues/48): Gate changes with reproducible CI checks and a checked production image**

Implement CI verification and immutable image production as code, keeping production promotion separate until T43.

**Blocked by:** [T41 #47](https://github.com/abobwhite/f3-yeti-man/issues/47). **Blocks:** [T43 #49](https://github.com/abobwhite/f3-yeti-man/issues/49).

**Spec:** [SPEC-common.md](SPEC-common.md): `COMMON-03`, `COMMON-06`.

### T43

**[T43 #49](https://github.com/abobwhite/f3-yeti-man/issues/49): Define App Platform automatic promotion and application rollback**

Prepare the chosen DigitalOcean deployment integration and runbook so checked main merges deploy automatically with readiness verification and a known-good image rollback.

**Blocked by:** [T42 #48](https://github.com/abobwhite/f3-yeti-man/issues/48). **Blocks:** [T44A #50](https://github.com/abobwhite/f3-yeti-man/issues/50), [T44B #51](https://github.com/abobwhite/f3-yeti-man/issues/51).

**Spec:** [SPEC-common.md](SPEC-common.md): `COMMON-06`; [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-14`, `FOUND-A11`.

### T44A

**[T44A #50](https://github.com/abobwhite/f3-yeti-man/issues/50): Document and enforce indefinite competition retention and credential removal**

Make the confirmed history policy and exceptional operator deletion/recovery process explicit without adding a Slack hard-delete feature.

**Blocked by:** [T43 #49](https://github.com/abobwhite/f3-yeti-man/issues/49). **Blocks:** [C5 #52](https://github.com/abobwhite/f3-yeti-man/issues/52).

**Spec:** [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-02`, `FOUND-13`; [SPEC-common.md](SPEC-common.md): `COMMON-07`.

### T44B

**[T44B #51](https://github.com/abobwhite/f3-yeti-man/issues/51): Prepare monitored backups and a tested isolated restore procedure**

Build the recovery procedure and test harness for the accepted <=24-hour data-loss and one-business-day restoration objectives; final managed-cluster evidence is recorded at C7.

**Blocked by:** [T43 #49](https://github.com/abobwhite/f3-yeti-man/issues/49). **Blocks:** [C5 #52](https://github.com/abobwhite/f3-yeti-man/issues/52).

**Spec:** [SPEC-common.md](SPEC-common.md): `COMMON-07`; [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-A12`.

### C5

**[C5 #52](https://github.com/abobwhite/f3-yeti-man/issues/52): Verify the complete non-scheduled V1 feature set**

Verify priority 5 is complete before selecting scheduled-report execution work. Deployment configuration/runbooks are verified without silently provisioning paid services.

**Blocked by:** [T34 #40](https://github.com/abobwhite/f3-yeti-man/issues/40), [T39 #45](https://github.com/abobwhite/f3-yeti-man/issues/45), [T40 #46](https://github.com/abobwhite/f3-yeti-man/issues/46), [T44A #50](https://github.com/abobwhite/f3-yeti-man/issues/50), [T44B #51](https://github.com/abobwhite/f3-yeti-man/issues/51). **Blocks:** [T45 #53](https://github.com/abobwhite/f3-yeti-man/issues/53).

**Spec:** [SPEC-entry-ledger.md](SPEC-entry-ledger.md): `LEDGER-A9`, `LEDGER-A10`, `LEDGER-A11`, `LEDGER-A18`; [SPEC-entry-capture.md](SPEC-entry-capture.md): `CAPTURE-A8`, `CAPTURE-A14`; [admin-entry-browser.md](admin-entry-browser.md): `BROWSE-A1`, `BROWSE-A2`, `BROWSE-A3`, `BROWSE-A4`, `BROWSE-A5`, `BROWSE-A6`, `BROWSE-A7`; [SPEC-reporting.md](SPEC-reporting.md): `REPORT-A3`, `REPORT-A4`, `REPORT-A9`, `REPORT-A10`, `REPORT-A12`, `REPORT-A14`, `REPORT-A15`, `REPORT-A16`; [SPEC-common.md](SPEC-common.md): `COMMON-02`, `COMMON-06`, `COMMON-07`.

## Priority 6

Scheduled reporting and final verification.

### T45

**[T45 #53](https://github.com/abobwhite/f3-yeti-man/issues/53): Persist validated report automation definitions and report eligibility**

Extend the existing manual report definitions with versioned region-owned automation configuration and lifecycle providers, not a separate metric catalog.

**Blocked by:** [C5 #52](https://github.com/abobwhite/f3-yeti-man/issues/52). **Blocks:** [T46 #54](https://github.com/abobwhite/f3-yeti-man/issues/54), [T47 #55](https://github.com/abobwhite/f3-yeti-man/issues/55), [T49 #58](https://github.com/abobwhite/f3-yeti-man/issues/58).

**Spec:** [automated-reports.md](automated-reports.md): `AUTO-01`, `AUTO-02`, `AUTO-03`, `AUTO-04`, `AUTO-05`; [SPEC-reporting.md](SPEC-reporting.md): `REPORT-14`, `REPORT-16`, `REPORT-17`, `REPORT-20`; [configuration-contract.md](configuration-contract.md): `CONFIG-18`.

### T46

**[T46 #54](https://github.com/abobwhite/f3-yeti-man/issues/54): Configure and preview multiple automated reports in admin Home**

Register the report automation admin panel and focused per-automation Save/Cancel/preview/state controls through the composition root.

**Blocked by:** [T45 #53](https://github.com/abobwhite/f3-yeti-man/issues/53). **Blocks:** [T51 #60](https://github.com/abobwhite/f3-yeti-man/issues/60).

**Spec:** [automated-reports.md](automated-reports.md): `AUTO-01`, `AUTO-02`, `AUTO-03`, `AUTO-04`, `AUTO-05`, `AUTO-09`, `AUTO-10`; [SPEC-reporting.md](SPEC-reporting.md): `REPORT-14`, `REPORT-16`; [configuration-contract.md](configuration-contract.md): `CONFIG-18`.

### T47

**[T47 #55](https://github.com/abobwhite/f3-yeti-man/issues/55): Compute timezone-aware daily and weekly occurrences within season dates**

Implement pure, clock-injected recurrence calculations independent of transport, with explicit DST and configured season-bound behavior.

**Blocked by:** [T45 #53](https://github.com/abobwhite/f3-yeti-man/issues/53). **Blocks:** [T48A #56](https://github.com/abobwhite/f3-yeti-man/issues/56).

**Spec:** [automated-reports.md](automated-reports.md): `AUTO-06`, `AUTO-07`, `AUTO-08`.

### T48A

**[T48A #56](https://github.com/abobwhite/f3-yeti-man/issues/56): Claim persisted due report occurrences with cross-instance leases**

Add durable due-occurrence collection and run state using MongoDB plus foundation's generic lease/outbox runtime.

**Blocked by:** [T47 #55](https://github.com/abobwhite/f3-yeti-man/issues/55). **Blocks:** [T48B #57](https://github.com/abobwhite/f3-yeti-man/issues/57).

**Spec:** [automated-reports.md](automated-reports.md): `AUTO-09`, `AUTO-12`; [SPEC-reporting.md](SPEC-reporting.md): `REPORT-16`.

### T48B

**[T48B #57](https://github.com/abobwhite/f3-yeti-man/issues/57): Coalesce missed schedules and invalidate obsolete queued runs**

Implement the confirmed outage/catch-up and configuration-change semantics over durable occurrences before any channel post is authorized.

**Blocked by:** [T48A #56](https://github.com/abobwhite/f3-yeti-man/issues/56). **Blocks:** [T50 #59](https://github.com/abobwhite/f3-yeti-man/issues/59).

**Spec:** [automated-reports.md](automated-reports.md): `AUTO-07`, `AUTO-08`, `AUTO-12`, `AUTO-13`.

### T49

**[T49 #58](https://github.com/abobwhite/f3-yeti-man/issues/58): Render selected automated report sections from one scoring snapshot**

Reuse every non-personal manual report's metric/read contracts to render bounded scheduled compositions with selected presentation details.

**Blocked by:** [T45 #53](https://github.com/abobwhite/f3-yeti-man/issues/53). **Blocks:** [T50 #59](https://github.com/abobwhite/f3-yeti-man/issues/59).

**Spec:** [automated-reports.md](automated-reports.md): `AUTO-03`, `AUTO-04`, `AUTO-05`, `AUTO-11`; [SPEC-reporting.md](SPEC-reporting.md): `REPORT-14`, `REPORT-15`, `REPORT-17`, `REPORT-20`.

### T50

**[T50 #59](https://github.com/abobwhite/f3-yeti-man/issues/59): Deliver scheduled channel posts with final authorization and cutoff checks**

Connect eligible leased runs to the reused renderer and durable Slack delivery, treating the last pre-post checks as part of authorization.

**Blocked by:** [T48B #57](https://github.com/abobwhite/f3-yeti-man/issues/57), [T49 #58](https://github.com/abobwhite/f3-yeti-man/issues/58). **Blocks:** [T51 #60](https://github.com/abobwhite/f3-yeti-man/issues/60).

**Spec:** [automated-reports.md](automated-reports.md): `AUTO-07`, `AUTO-09`, `AUTO-10`, `AUTO-11`, `AUTO-12`, `AUTO-13`.

### T51

**[T51 #60](https://github.com/abobwhite/f3-yeti-man/issues/60): Show automation progress, run history and repair guidance to admins**

Complete admin visibility for independent report schedules and durable execution outcomes without exposing scheduling credentials or unsafe replay controls.

**Blocked by:** [T46 #54](https://github.com/abobwhite/f3-yeti-man/issues/54), [T50 #59](https://github.com/abobwhite/f3-yeti-man/issues/59). **Blocks:** [C6 #61](https://github.com/abobwhite/f3-yeti-man/issues/61).

**Spec:** [automated-reports.md](automated-reports.md): `AUTO-01`, `AUTO-12`, `AUTO-13`.

### C6

**[C6 #61](https://github.com/abobwhite/f3-yeti-man/issues/61): Verify season-bounded scheduled reports across the full catalog**

Close the final feature-priority milestone using fake-clock integration and authorized isolated Slack delivery, not a real-season wait.

**Blocked by:** [T51 #60](https://github.com/abobwhite/f3-yeti-man/issues/60). **Blocks:** [C7 #62](https://github.com/abobwhite/f3-yeti-man/issues/62).

**Spec:** [automated-reports.md](automated-reports.md): `AUTO-A1`, `AUTO-A2`, `AUTO-A3`, `AUTO-A4`, `AUTO-A5`, `AUTO-A6`, `AUTO-A7`, `AUTO-A8`, `AUTO-A9`; [SPEC-reporting.md](SPEC-reporting.md): `REPORT-A11`, `REPORT-A12`, `REPORT-A13`, `REPORT-A14`, `REPORT-A15`, `REPORT-A16`.

### C7

**[C7 #62](https://github.com/abobwhite/f3-yeti-man/issues/62): Verify production readiness, regional isolation and recovery on the selected host**

Collect final measured evidence against the confirmed DigitalOcean/low-traffic operating direction after every feature milestone. This verification issue does not authorize unapproved paid resources or real-user message posting.

**Blocked by:** [C6 #61](https://github.com/abobwhite/f3-yeti-man/issues/61). **Blocks:** None.

**Spec:** [SPEC-common.md](SPEC-common.md): `COMMON-01`, `COMMON-02`, `COMMON-03`, `COMMON-04`, `COMMON-05`, `COMMON-06`, `COMMON-07`; [SPEC-workspace-foundation.md](SPEC-workspace-foundation.md): `FOUND-A1`, `FOUND-A2`, `FOUND-A3`, `FOUND-A4`, `FOUND-A5`, `FOUND-A6`, `FOUND-A7`, `FOUND-A8`, `FOUND-A9`, `FOUND-A10`, `FOUND-A11`, `FOUND-A12`.

## Coverage

Every one of the 224 numbered requirements and acceptance cases in the source specification has at least one task/checkpoint reference. The per-document implementation-task tables below the requirements provide the reverse mapping. Coverage means planned ownership, not implemented or passing behavior.
