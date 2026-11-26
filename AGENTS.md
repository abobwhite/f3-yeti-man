# Repository coding guidance

## Scope and context

- Review happens on pull requests. After implementation and required checks pass, commit the scoped changes, push a feature branch and create a PR without waiting for review of uncommitted code. Wait for the user to review/approve the PR before merging; do not merge or begin a dependent issue until that approval.
- Start with `git status --short` and [PROGRESS.md](PROGRESS.md). Preserve existing work.
- Use [SPEC_INDEX.md](SPEC_INDEX.md) to select the task's relevant spec sections, usually 1–2 files. Do not load all of `docs/spec/` or the whole implementation plan by default.
- Read the selected issue's acceptance criteria and direct blockers before implementation. GitHub Issues is the task-status authority; `PROGRESS.md` is a short local handoff, not a second backlog.
- Use `rg -n` and bounded reads for task IDs, requirement IDs and headings. Load more specs when dependencies require them; the 1–2 file target is not a correctness limit.
- Module specs inherit `docs/spec/SPEC-common.md`; read its relevant contracts when they apply. Read related source/tests and one existing pattern before editing.
- Work on one feature slice or a small dependent batch. Continue in the same chat while context is useful; hand off at a completed boundary or when switching areas. See [workflow details and prompt](docs/codex-workflow.md) only when needed.

## Commands and verification

Use the installed toolchain from `package.json` and `package-lock.json` (Node 26.x); tests run TypeScript directly with Node's built-in runner. No `tsx` dependency or `npm test` script is needed.

| Purpose | Command |
|---|---|
| One test file | `node --test --test-reporter=spec tests/unit/entry-ledger/rules.test.ts` (replace with the relevant path) |
| Selected integration files | `node --test --test-concurrency=1 tests/integration/entry-ledger/seasons.test.ts` (replace/add relevant paths) |
| Module unit + integration | `npm run test:module -- entry-ledger` (or `workspace-foundation`, `entry-capture`, `f3-ingestion`, `reporting`; modules without tests fail) |
| Type check | `npm run typecheck` |
| Lint/format check | `npm run lint` |
| Production build | `npm run build` |
| All unit tests | `npm run test:unit` |
| All integration tests | `npm run test:integration` |
| Coverage gate | `npm run test:coverage` |
| Full batch gate | `npm run check` (typecheck, lint, build, unit, coverage, integration) |

- Iterate with affected test files; typecheck after meaningful TypeScript changes. Do not run full builds/suites after every small edit or repeat unchanged passing checks.
- Add or update unit tests for all practical domain and orchestration logic introduced or changed: validation, decisions, transformations, error paths and boundary cases. Extract pure rules or inject dependencies when needed to test them without MongoDB or Slack. Integration coverage alone is insufficient for logic that can reasonably be unit tested; avoid tests that merely mirror implementation details.
- Use integration tests alongside unit tests to verify real persistence behavior, indexes, transactions, tenant isolation and concurrency/lock guarantees. Keep explicit assertions for these invariants even when unit tests cover the underlying rules.
- At the end of a code batch, run `npm run check` once before review. Do not also run its constituent commands again. Preserve coverage thresholds and explicit scoring, tenant, duplicate and lock assertions.
- For documentation-only edits, check links, paths, command accuracy and `git diff --check`; application builds/tests are unnecessary unless executable behavior changed.
- Keep verbose check output in a temporary log; report the exit status and a short summary. On failure, inspect the relevant diagnostics, expand if needed and retain the log path. Never hide a failing status with `| tail`, `|| true` or output truncation. A safe recipe is in `docs/codex-workflow.md`.
- Integration tests use isolated real MongoDB replica sets; Docker integration and live Slack sandbox checks are separate, task-dependent checks. Never use production data or a real Slack channel as an implicit test target.

## Project conventions

- TypeScript ESM; preserve `.ts` relative imports used by the build's extension rewriting. Keep domain rules pure and inject persistence, Slack clients and clocks into orchestration.
- Keep five module boundaries under `src/modules/`: `workspace-foundation`, `entry-ledger`, `entry-capture`, `f3-ingestion`, `reporting`. Use provider contracts rather than reaching into another module's repositories.
- Competition records are entries; workouts are external references. Preserve tenant isolation, setup gates, season locks and audit history.
- Use module-local repositories over the official MongoDB driver and Zod for untrusted runtime data. Do not introduce an ODM or generic persistence framework.
- For the MongoDB Node.js driver 7.9+, avoid the deprecated two-argument `createIndex(indexSpec, options)` overload. Use `createIndexes([{ key: indexSpec, ...indexOptions }])` or the three-argument `createIndex(indexSpec, indexOptions, commandOptions)` overload. Check the installed driver's declarations and current MongoDB guidance before changing index code.
- Keep secrets, database data, build output, coverage output and verbose logs out of tracked files.

## Handoff and efficiency

- Update only the current handoff in `PROGRESS.md` at a batch boundary: task/requirement IDs, changed files, verification commands/results, blockers and next step. Record the checked revision and any later edits; never claim checks cover newer code.
- Mark implementation complete only with acceptance evidence. Passing local checks authorizes the commit/push/PR review workflow above, not issue closure or merge; merge only after the user approves the PR.
- Keep this file stable and concise (under 150 lines); keep changing task state in `PROGRESS.md`. Avoid repeated spec dumps, full history reads and long passing-test logs.
- Model/reasoning choice belongs in the app. Prefer the least costly available setup that completes the slice reliably; increase reasoning for ambiguity, cross-module changes or difficult failures. Do not change it merely to follow a task counter.
