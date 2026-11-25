# Current handoff

Keep this file short: replace the current handoff at a batch boundary rather than append a chat transcript. GitHub Issues remains the backlog and status authority. Historical implementation evidence is recoverable from git.

## Baseline

- Recorded 2026-11-25 against `f3a3592` (setup gate, PR #75).
- Git history contains the T01–T10 implementation sequence: starter/TypeScript/checks, real MongoDB modes, encrypted installations, authorization, durable operations/outbox, scoring/reference rules, season fences and confirmed setup.
- These are landed-code observations, not a fresh acceptance audit or a claim that GitHub issues are closed. The full baseline gate was not rerun for this documentation batch.
- Next candidate: [T11 / issue #12](https://github.com/abobwhite/f3-yeti-man/issues/12), atomic versioned entry saves. Confirm blockers [T07 / #8](https://github.com/abobwhite/f3-yeti-man/issues/8) and [T10 / #11](https://github.com/abobwhite/f3-yeti-man/issues/11) are complete before starting.
- T11 context: `docs/spec/SPEC-entry-ledger.md` (`LEDGER-06/07/09/10/11/12/15`) and `docs/spec/SPEC-entry-capture.md` (`CAPTURE-07/14`); read applicable common persistence/validation contracts too.

## Current batch

- Scope: compact repo instructions, selective spec index, cost-aware chat/check workflow and this handoff. No application behavior changes.
- Changed files: `AGENTS.md`, `SPEC_INDEX.md`, `PROGRESS.md`, `docs/codex-workflow.md`, `README.md`, `docs/spec/implementation-tasks.md`, `tasks/plan.md`.
- Delivery: user explicitly authorized committing these changes, opening a PR and squash-merging it on 2026-11-25. GitHub records the resulting PR and merge status. This authorization covers this documentation batch only.
- Verification: `git diff --check` passed. A one-off Python audit resolved local links in all seven changed documents, confirmed all 16 specs are indexed, checked the 50-line root guidance and matched documented npm script names to `package.json`. The log recipe was exercised under `zsh -e` with exit codes 0 and 7: both preserved status and full logs while bounding displayed output. `node --test --test-reporter=spec tests/unit/entry-ledger/rules.test.ts` passed (5/5) on unchanged application code. Full build/check skipped for this documentation-only batch.
- Blockers: none for this batch. Model selection stays in the app; a new chat is optional at a useful task boundary.

## Update contract

For the next batch record: task/issue and requirement IDs; accepted scope/decisions; changed paths; actual HEAD plus uncommitted state; exact checks and outcomes (including failures/skips and log paths); unresolved questions; next task with blockers and relevant specs. A passing result applies only to the checked file state. Inspect `git status --short` and the relevant diff before reusing evidence.
