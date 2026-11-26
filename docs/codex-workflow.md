# Working through the spec efficiently

The root [AGENTS.md](../AGENTS.md) holds stable repo rules. [SPEC_INDEX.md](../SPEC_INDEX.md) routes to the 16 spec files; [PROGRESS.md](../PROGRESS.md) holds the current handoff. GitHub Issues remains the backlog so there is no second task checklist to synchronize.

## Choose a small slice

Use one feature or a small dependent batch, often 2–3 tasks. The task count is a guideline: some issues already span enough work for one chat. Check the selected issue's direct blockers and acceptance criteria, then read the relevant spec sections and nearby source/tests. Expand context when a shared contract or dependency requires it.

Use `rg -n` to locate a task/requirement/heading and bounded file reads to inspect it. Avoid dumping every spec, all source files or the complete git log. Read a selected GitHub issue once per unchanged scope; refresh its state when blocker/status decisions require current evidence.

Example next-slice prompt:

> Implement T11 (GitHub issue #12), after confirming blockers #8 and #11 are complete. Use PROGRESS.md and the T11 section of docs/spec/implementation-tasks.md to find its requirements in SPEC-entry-ledger.md and SPEC-entry-capture.md. Read applicable common contracts. Run affected tests while iterating and npm run check once at the end. Update PROGRESS.md with evidence, commit the checked changes and open a PR for review. Wait for the user to approve the PR before merging or starting a dependent issue.

When continuing within a chat, name the next task and any changed scope instead of pasting the same specs again. Start a fresh chat at a feature boundary, when switching areas, or when stale context becomes a burden. Before switching, record the current state and verification in `PROGRESS.md`; the next chat should inspect the real working tree, including uncommitted changes.

## Cache reuse and model choice

OpenAI documents prompt caching in terms of matching prompt prefixes. Stable instructions help reuse; changing models or tool definitions can disrupt it. Keep durable rules separate from changing progress, and avoid unnecessary configuration changes during a slice. These are practices informed by the [Codex agent-loop explanation](https://openai.com/index/unrolling-the-codex-agent-loop/#performance-considerations), not a guarantee of a desktop cache hit or a particular credit saving.

A fresh chat reduces accumulated context but does not inherently increase cache hits. Do not add filler to reach a caching threshold or reread documents just to warm a cache. The [API caching guide](https://developers.openai.com/api/docs/guides/prompt-caching) describes API behavior; it does not establish this account's desktop billing or expose a repo-controlled cache setting.

Choose model and reasoning effort in the app. Start with the least costly available choice that handles the work reliably and increase reasoning when the task warrants it. Judge total work, retries and correctness; a fixed model name or forced restart every few tasks does not guarantee the lowest total usage. This repository does not override personal model settings.

## Check once at the appropriate scope

- During implementation: run affected test files; use `npm run typecheck` after meaningful TypeScript changes. `npm run test:module -- <module-id>` covers a module's existing unit/integration tests.
- Before code review: run `npm run check` once for the final batch state. It already includes typecheck, lint, build, unit, coverage and integration. If a failed stage stops it, fix the failure and rerun the necessary gate; previous results do not cover subsequent edits.
- Run Docker integration or opt-in Slack sandbox checks when the issue requires them. Do not substitute a limited suite for required acceptance evidence.
- For documentation-only changes: verify links, paths, commands and `git diff --check`; skip application checks unless behavior changed.

No `npm test` script exists. Node runs the `.test.ts` files directly on the pinned runtime; no `npx tsx` install is needed. See `AGENTS.md` for exact commands. Tests under `tests/` run at runtime; the current typecheck covers `src/` only.

For verbose checks, keep the complete output in a unique temporary file and emit a bounded result while preserving the exit status:

```sh
check_log=$(mktemp "${TMPDIR:-/tmp}/yeti-check.XXXXXX") || exit 1
if npm run check >"$check_log" 2>&1; then
  check_status=0
else
  check_status=$?
fi
printf 'npm run check: exit %s; log: %s\n' "$check_status" "$check_log"
if [ "$check_status" -eq 0 ]; then
  tail -n 8 "$check_log"
else
  tail -n 80 "$check_log"
fi
exit "$check_status"
```

Run this in a shell command/subshell since `exit` ends that shell. A tail is only an initial diagnostic window: inspect earlier failure details in the log as needed. Do not pipe a check into `tail` and accidentally report the tail command's success. Keep logs outside the repo and put only commands, outcomes and useful diagnostics in the handoff.
