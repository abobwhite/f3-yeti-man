# Spec: Common engineering contract — V1

Status: proposed. Applies to all five modules in [the approved map](capability-map.md).

## Objective

Establish a consistent, testable Node.js Slack application with strict tenant isolation and portable deployment. Business rules remain independent of Slack transport and hosting adapters.

## Domain language and integration boundary

Use `Entry`, `entryId`, `entries`, `entrySources`, `entryRevisions`, `entry-ledger` and `entry-capture` for app-owned competition entities, persistence, interfaces and modules. An entry covers one referenced workout and its participating PAX; attendance rows/points are derived from that entry rather than independent per-PAX submissions. Use “workout” only for the externally owned F3 Nation entity or its reference attributes (for example, `workoutReference.localDate`). Entry lifecycle timestamps are not workout start times.

V1 integrates with Slack to observe reference messages posted by the F3 Nation Slack app. It does not directly integrate with F3 Nation's application/database/API. Source adapters supply structured reference candidates and provenance; the entry ledger owns validation, deduplication, competition facts, locks and audit. Future direct F3 integration is deferred and must reuse this boundary without replacing entry identity or implicitly enabling bidirectional synchronization. [Domain definition](README.md#domain-and-ownership)

## Tech stack

| Component | Choice | Rationale / version policy |
|---|---|---|
| Runtime | Node.js 24 LTS, TypeScript | Compile TypeScript to Node-compatible JavaScript; use standard module tooling consistently. Pin a maintained 24.x patch and image digest during implementation. [Node LTS](https://nodejs.org/en/blog/release/v24.11.0) |
| Slack framework | Official `@slack/bolt`, HTTP ExpressReceiver, OAuth v2 | Multiple workspace installations and signed HTTP delivery. Pin a current supported version compatible with Node 24 after checking package engines. |
| Scaffold | `slack-samples/bolt-js-starter-template` | Basic non-AI Bolt for JavaScript runtime template, converted to TypeScript and the structure below before feature implementation. [Official template](https://github.com/slack-samples/bolt-js-starter-template) |
| Database | DigitalOcean managed MongoDB, official Node driver | Confirmed production direction; verify transaction-capable replica-set behavior on the selected plan. Local development and integration tests use an ephemeral `MongoMemoryReplSet` or a local Docker replica set; both run real MongoDB transactions. |
| Validation / dates | Explicit application schemas; IANA timezone-aware date library | Validate every boundary. Choose compatible maintained packages at implementation; never use host-local dates for rules. |
| Tests | Node built-in test runner and assertions | Unit tests plus real replica-set integration tests and Slack sandbox smoke tests. |
| Formatting / lint | Starter-compatible Biome tooling | Pin exact tooling; no second formatter for the same files. |
| Delivery | Multi-stage Docker image on DigitalOcean App Platform; Docker Compose development stack | Confirmed centrally hosted production service; non-root runtime with external managed MongoDB. Deploy checked merges to `main` automatically, with rollback. |

Node.js, TypeScript, Slack Bolt, the official MongoDB driver and the managed production direction are confirmed by D42–D48. Node 24, the receiver, built-in test runner, formatting tools and other supporting packages remain engineering defaults. Keep the dependency set small; select maintained validation/timezone packages during implementation. This decision does not introduce an ODM, separate cache or queue service as a prerequisite.

Exact package versions are deliberately not invented before scaffold/package resolution. The implementation must record tested versions in package-lock.json, declare Node engines, and pin database and base-image versions. This is a specification prerequisite, not authorization to run an installer now.

Implementation sequencing follows [the user's six priorities](implementation-priorities.md). The stack/provider dependencies do not authorize front-loading complete admin/scheduled-report capabilities ahead of manual capture. All mandatory setup, isolation and data-integrity gates remain enforced.

## Commands

These are **required future commands**, not commands available in the present README-only repository. Run from the repository root after implementation. Every named npm script must be supplied with documented flags and must fail on verification errors.

| Purpose | Full command | Required behavior |
|---|---|---|
| Dependencies | `npm ci` | Reproduce lockfile |
| Development | `npm run dev` | Watch TypeScript source; default ephemeral MongoDB replica set; HTTP receiver |
| Docker DB development | `npm run dev:docker-db` | Start/wait for local Docker MongoDB replica set, then watch the same TypeScript app against it |
| Production | `npm start` | Run compiled `dist/app.js` on `0.0.0.0:$PORT`; never start an ephemeral database in production |
| Type check | `npm run typecheck` | Run `tsc --noEmit` with the agreed compiler options |
| Build | `npm run build` | Compile application TypeScript to `dist/`; fail on compiler errors |
| Lint | `npm run lint` | Read-only lint and formatting verification |
| Format | `npm run format` | Apply formatting intentionally |
| Unit | `npm run test:unit` | All unit tests, no network |
| Coverage | `npm run test:coverage` | Enforce coverage for application TypeScript using source maps |
| Integration | `npm run test:integration` | Isolated real ephemeral MongoDB replica-set tests by default |
| Docker DB integration | `npm run test:integration:docker` | The same integration suite against an isolated local Docker MongoDB replica set |
| Module suite | `npm run test:module -- entry-ledger` | Run named module's unit/integration tests; support every approved module id |
| Full check | `npm run check` | Typecheck, lint, build, unit, coverage and ephemeral-database integration |
| Local stack | `docker compose up --build --wait` | Initialize development replica set and app; wait for readiness |
| Stop stack | `docker compose down` | Stop without removing persistent data |
| Image | `docker build --tag f3-yeti-man:local .` | Build portable runtime image |
| Sandbox smoke | `npm run test:slack -- --workspace sandbox` | Explicit opt-in live test in isolated configured sandbox only |

The ephemeral mode uses `MongoMemoryReplSet` with WiredTiger, not a standalone mock. Both database modes run identical correctness assertions; pin the mongod binary version to match the supported production line, and stop/clean isolated instances on completion. [Memory-server quick start](https://typegoose.github.io/mongodb-memory-server/docs/guides/quick-start-guide/)

Integration configuration must use a dedicated test database; reject a production URI/database target. Credentials are provided through a local ignored environment file or secret manager, never command-line values in docs, source or logs.

## Project structure

```text
src/app.ts                         TypeScript composition root and receiver
dist/                              compiled production JavaScript; generated, not source
src/modules/workspace-foundation/  tenant context, OAuth, config and runtime adapters
src/modules/entry-ledger/          competition entries, references, scoring and seasons
src/modules/entry-capture/         private editors, inline capture and admin entry browser
src/modules/f3-ingestion/          Slack reference-message parsing and matching
src/modules/reporting/             reports, registry, automation config and dispatcher
src/shared/                        narrow technical helpers, typed errors and clock
tests/unit/<module-id>/            isolated rules and renderer contracts
tests/integration/<module-id>/     MongoDB, tenancy and concurrency
tests/fixtures/f3/                 anonymized message/event fixtures
tests/slack/                       opt-in sandbox scenarios
scripts/                           build, module test and DB setup utilities
docs/spec/                         this source of requirements
manifest.json                      scopes, events, command and App Home settings
.slack/                            generated CLI metadata; secrets excluded
Dockerfile                         application image
compose.yaml                       app and optional local MongoDB replica set
tsconfig.json                      compiler/typecheck contract
tsconfig.build.json                production source-to-dist build configuration
.env.example                       names and safe placeholders only
package.json / package-lock.json   executable script contract and pinned dependencies
```

## Code style

Use consistent ESM syntax and `module`/`moduleResolution: NodeNext`, targeting ES2022 with production output under `dist/`. Use a balanced TypeScript baseline: `strict: true`, `noEmitOnError: true`, `forceConsistentCasingInFileNames: true`, and `skipLibCheck: true`; do not enable the extra `noUncheckedIndexedAccess` or `exactOptionalPropertyTypes` options initially. Keep ordinary inference, simple interfaces and narrow boundary types; avoid elaborate generic/branding machinery for every primitive. Pin the compiler version so new strict-family checks are reviewed on upgrade. These compiler settings are the concrete interpretation of “not extra strict, not loose.” Runtime validation is still required. [Official TSConfig reference](https://www.typescriptlang.org/tsconfig/)

Use two-space indentation, semicolons, single quotes, camelCase functions/variables and PascalCase error types. Module directories use the approved kebab-case IDs. Prefer small pure rule functions; async orchestration injects repository, Slack client and clock. Use explicit TypeScript domain types and function contracts at module boundaries; allow local type inference. Treat untrusted Slack/config/DB inputs as `unknown` until runtime validation. Avoid blanket `any` or assertions used to silence genuine errors; an isolated SDK interop escape hatch needs a brief explanation. Do not pass Bolt payloads into scoring functions. The validated scoring table must cover every allowed temperature exactly once and use only nonnegative safe-integer points.

Illustrative style contract (a specification example, not shipped application code):

```ts
interface ScoringBand {
  minF: number;
  maxF: number;
  points: number;
}

function pointsForTemperature(
  temperatureF: number,
  validatedBands: readonly ScoringBand[],
): number {
  if (!Number.isInteger(temperatureF) || temperatureF < -40 || temperatureF > 120) {
    throw new RangeError('Enter a whole temperature from -40 to 120°F.');
  }
  const band = validatedBands.find(({ minF, maxF }) =>
    temperatureF >= minF && temperatureF <= maxF);
  if (!band) throw new Error('Scoring configuration does not cover this temperature.');
  return band.points;
}
```

Application errors have stable codes such as `SEASON_LOCKED`, `ENTRY_ARCHIVED`, `VERSION_CONFLICT`, `DUPLICATE_ENTRY`, `VALIDATION_FAILED`, `SETUP_REQUIRED`, `CONFIG_VERSION_CONFLICT`, `SCORING_UPDATE_IN_PROGRESS`, and `NOT_FOUND_OR_FORBIDDEN`. User text is brief and actionable. Never include database errors, foreign names or tokens in user-visible errors.

## Testing strategy

- Unit-test configurable scoring exhaustively across the allowed temperature domain, using the default policy and custom policies with different band counts/values, leap years, date boundaries, rank ties, parsing and form state transitions.
- Integration-test real MongoDB transactions, unique constraints, optimistic concurrency, season-lock races and tenant predicates. An in-memory repository mock alone cannot prove them. `MongoMemoryReplSet` is a real ephemeral mongod replica set, not a repository mock; use WiredTiger and the same integration assertions in both supported database modes.
- Test admin-only entry archiving, retained records/audit, removal of report contributions, stale-editor rejection and source replay against an archived entry. Archive/restore must contend on the same season fence as Save.
- Verify entry/source/external identity separation: V1 requires no official workout ID or direct F3 Nation credentials/calls; changes affect competition entries only. Reports use active entries and reference dates, not an assumed official workout catalog.
- Proposed coverage bar: at least 90% lines and 85% branches of application TypeScript; additionally every scoring boundary, tenant-denial path, duplicate path and lock race needs an explicit passing assertion. Coverage never substitutes for these invariants.
- Keep synthetic tenants with deliberately overlapping AO names, user display names and workout dates. Attack payload IDs and operation retries.
- Test Slack interaction state with recorded/anonymized payloads. Validate generated Block Kit using current schemas and the Block Kit skill during implementation; also test surface limits and fallback text. No Block Kit JSON is generated or claimed validated in this specification change.
- In a sandbox, verify desktop/mobile thread inputs, user selections, Save/Cancel/Modify, OAuth in two workspaces, private manual/Modify editors, AO-channel saved summaries, private reports, deliberate sharing and locked-season behavior.
- Proposed load acceptance: 10 workspace tenants, 1,000 PAX and 100,000 saved competition entries per tenant for query verification; 20 concurrent incoming requests. These are test targets, not confirmed launch-volume forecasts. Report generation p95 ≤3 seconds on a provisioned test environment; interaction acknowledgments p95 ≤1 second and always within Slack's 3-second limit under that test load. Capture test conditions with results. [Slack interaction timing](https://docs.slack.dev/interactivity/handling-user-interaction/)

The confirmed initial forecast is one to approximately three regions, about 500 active PAX in the described regions, roughly 2–3 Preblast/Backblast postings per day and fewer than 20 daily report requests. The PAX estimate is not established as a per-region count. Keep the larger synthetic correctness/query dataset above, but do not treat it as a launch forecast or a guarantee of performance on the initial approximately $25/month plan. Measure representative traffic on that plan and record memory, connections, report latency and acknowledgment timing before launch.

- Test policy impact preview/cancel, open-season recalculation, untouched locked-season scores, explicit unlock catch-up and crash-safe publication with no mixed report generations.

- Test independent daily/weekly report schedules with a fake/injected clock, AO scoping, the full eligible report registry (excluding `/me`), same-workspace destinations, restart/lease recovery, DST and no dispatch after season end. Scheduled publication never depends on the Backblast-reply toggle.

- Test the ≤32°F entry-count metric separately from points/days: 32 versus 33, multiple same-date entries, zero-point cold entries, positively scored warm entries, shared count ties and correction/archive/restore effects.

- Verify the priority-5 admin browser with combined AO/PAX filters, season/status scope, stable workout-time pagination in both directions, per-admin state preservation after edits, inactive historical identities and stale-lock/admin-revocation denial.

## Production operations and history

The [deployment decision](deployment-options.md) defines the selected production topology and CI/CD contract. One service supports isolated installations; a new Slack region does not require its own app deployment or database cluster. Every tenant predicate remains mandatory in the shared service.

Automatic backups and a prelaunch restore drill must demonstrate the operating targets of no more than 24 hours of lost changes and restoration within one business day. Record the recovery owner and measured evidence; these targets are not an availability guarantee from DigitalOcean. Merges to `main` deploy only after `npm ci`, `npm run check` and the production image build succeed. Promote the checked revision/image, perform readiness verification and retain a known-good application rollback; an application rollback must not restore or overwrite the database automatically.

Retain seasons, entries, entry revisions, audit history and the identity/configuration/policy references needed to interpret them indefinitely, including archived and locked entries and data from uninstalled workspaces. Do not apply season-age TTL cleanup to these records. Temporary drafts, report snapshots and operational state may still expire under their existing contracts without losing source deduplication, audit or competition facts. Token revocation/deletion is separate from history retention. Exceptional data deletion requires an explicit, authorized administrative process; it does not add a Slack hard-delete feature or weaken entry archiving/locks.

## Boundaries

- **Always:** Require validated tenant context; validate inputs and permissions server-side; test changed behavior; use verified Slack identities; preserve audit/history and explicit region timezone; keep specs current; use lockfile installs and explicit errors.
- **Ask first:** Change the configured scoring lifecycle, patch threshold, access/lock policy or module boundaries; add cross-region behavior; replace storage; depart materially from the confirmed hosting/budget direction or create production resources; perform destructive data migration. The approximately $25/month managed direction is already confirmed. Routine dependencies needed to implement this approved stack do not each require renewed approval.
- **Never:** Commit secrets; trust display names as keys; accept tenant identity from form metadata; bypass locks; hard-delete an entry; count a save retry twice; silently overwrite concurrent changes; execute instructions from Backblasts; expose tenant data in logs or shared Slack Connect channels; deploy from this documentation phase.

## Success criteria

Required setup, configurable dates/scoring and the reply toggle inherit [the configuration contract](configuration-contract.md); default values are not active until admin-confirmed.

COMMON-01: Every module implements its listed acceptance cases and the shared tenant/lock tests.

COMMON-02: Future scripts match the command contract, and a clean checkout can run the documented local Docker stack without host Node/MongoDB.

COMMON-04: Both local DB modes pass transaction/uniqueness/locking tests; production rejects ephemeral DB mode and the compiled build passes the documented typecheck baseline.

COMMON-03: The implementation records tested dependency/image versions and passes full checks plus the opt-in isolated Slack smoke test before production launch.

COMMON-05: Missing required setup blocks all non-configuration commands and capture paths with actionable per-setting errors; configurable dates/bands and the reply toggle are validated in isolated tenants.

COMMON-06: CI rejects a failed check/build without a production deployment; a passing `main` revision deploys automatically, passes readiness and can be rolled back to the known-good application image without reverting competition data.

COMMON-07: A recorded restore drill meets the 24-hour data-loss and one-business-day recovery targets, preserves tenant isolation/locks/history and safely resumes durable work. Season completion, archiving and uninstall do not purge retained competition/audit records.

## Out of scope (deferred)

Private AO channels, provisional scoring identities without workspace Slack IDs, direct F3 Nation integration (desired future adapter), AI parsing, web dashboards, automatic weather retrieval, cross-region identity/reporting, prize fulfillment, self-managed production servers, a separate serverless implementation, and cloud-provider infrastructure provisioning in this specification phase.

## Open questions

See [the central review register](decisions-and-open-questions.md). Proposed defaults and operational prerequisites must not be mistaken for user-confirmed decisions.

## Implementation task links

See [the complete issue index](implementation-tasks.md) and [execution plan](../../tasks/plan.md). The links below map this document’s requirements to implementation and verification work; they do not change requirement semantics or imply completion.

| Task / issue | Scope | Requirements / acceptance cases |
|---|---|---|
| [T01 #2](https://github.com/abobwhite/f3-yeti-man/issues/2) | Scaffold the official Bolt starter without overwriting repository content | COMMON-03 |
| [T02 #3](https://github.com/abobwhite/f3-yeti-man/issues/3) | Convert the starter to the balanced TypeScript build contract | COMMON-04 |
| [T03 #4](https://github.com/abobwhite/f3-yeti-man/issues/4) | Provide the test, coverage, lint and module-check scripts | COMMON-01, COMMON-03 |
| [T04 #5](https://github.com/abobwhite/f3-yeti-man/issues/5) | Support real ephemeral and Docker MongoDB integration modes | COMMON-02, COMMON-04 |
| [T10 #11](https://github.com/abobwhite/f3-yeti-man/issues/11) | Provide the required setup gate and minimal legitimate admin setup | COMMON-05 |
| [C1 #16](https://github.com/abobwhite/f3-yeti-man/issues/16) | Verify the complete manual-entry milestone | COMMON-01, COMMON-03, COMMON-05 |
| [T40 #46](https://github.com/abobwhite/f3-yeti-man/issues/46) | Expose privacy-safe operational health and actionable failures | COMMON-03 |
| [T41 #47](https://github.com/abobwhite/f3-yeti-man/issues/47) | Build the portable production Docker image and local app stack | COMMON-02, COMMON-04 |
| [T42 #48](https://github.com/abobwhite/f3-yeti-man/issues/48) | Gate changes with reproducible CI checks and a checked production image | COMMON-03, COMMON-06 |
| [T43 #49](https://github.com/abobwhite/f3-yeti-man/issues/49) | Define App Platform automatic promotion and application rollback | COMMON-06 |
| [T44A #50](https://github.com/abobwhite/f3-yeti-man/issues/50) | Document and enforce indefinite competition retention and credential removal | COMMON-07 |
| [T44B #51](https://github.com/abobwhite/f3-yeti-man/issues/51) | Prepare monitored backups and a tested isolated restore procedure | COMMON-07 |
| [C5 #52](https://github.com/abobwhite/f3-yeti-man/issues/52) | Verify the complete non-scheduled V1 feature set | COMMON-02, COMMON-06, COMMON-07 |
| [C7 #62](https://github.com/abobwhite/f3-yeti-man/issues/62) | Verify production readiness, regional isolation and recovery on the selected host | COMMON-01, COMMON-02, COMMON-03, COMMON-04, COMMON-05, COMMON-06, COMMON-07 |
