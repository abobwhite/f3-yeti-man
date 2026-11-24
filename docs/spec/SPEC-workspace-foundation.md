# Spec: Workspace foundation — V1

Module id: `workspace-foundation`. Status: proposed. Depends on: none.
Inherits [the common contract](SPEC-common.md), including stack, project structure, style, tests and boundaries.

## Objective

Provide authenticated, isolated Slack installations with region-owned configuration, an admin Home experience, durable MongoDB infrastructure and a Docker runtime.

## Requirements

FOUND-01: Install with OAuth v2 into individual workspaces. One workspace maps to exactly one region in V1. Store a unique installation keyed by Slack team ID and verify the application ID. An Enterprise organization ID never replaces a workspace key. Org-wide Enterprise installation is deferred; individual workspace installs remain isolated even inside one organization.

FOUND-02: Persist per-installation bot tokens encrypted at rest with a deployment-managed key, plus granted scopes, bot identity, installer user ID, timestamps and active/revoked state. OAuth state must be verified and single-use. Reinstallation updates credentials without erasing settings or competition entry data and must not automatically grant the reinstalling user admin rights. Use a persistent custom installation store, not a file or in-memory store. [Bolt OAuth](https://docs.slack.dev/tools/bolt-js/concepts/authenticating-oauth/)

FOUND-03: Validate Slack's signature against the raw HTTP body and reject stale/replayed request timestamps before resolving context. Then derive `{ teamId, regionId, actorUserId, installationId }` from the verified installation and Slack payload, never a submitted region ID. Unknown/revoked installations fail closed. Verify interactive actors are eligible workspace members; receiving an event posted by another app is not interactive-user authorization. [Slack signature verification](https://docs.slack.dev/authentication/verifying-requests-from-slack/)

FOUND-04: Every tenant-owned database record carries `teamId` and `regionId`. Every repository operation requires both and enforces their installation mapping, including object-ID lookups, draft/job retrieval, aggregates, pagination, caches and audit. Workspace-local Slack IDs are identity keys; display names are labels only. Cache keys include tenant context. Missing tenant context is a programmer error, never a global query.

FOUND-05: On first install, make the installer the first designated Yeti Man admin. An admin may add/remove other current workspace members. Do not permit removing the final admin. Slack workspace owners/admins have no implicit Yeti Man privileges unless designated. All admin mutations recheck authorization at commit, including stale Home views. A break-glass operator procedure for a departed final admin is an audited deployment operation, not an exposed Slack bypass.

FOUND-06: First-run admin Home shows region/timezone, AOs/schedules, competition dates, scoring policy and automatic-reply settings with per-setting validation/confirmation. Defaults alone never activate capture. Apply [CONFIG-01 through CONFIG-05](configuration-contract.md) to all entry providers and every non-configuration command, including reports/help. `/yeti configure` and admin Home remain usable to complete setup. Conditional trusted-source setup verifies Slack posts only, not direct F3 integration. Foundation exposes read-only setup-check/admin-panel extension points; the ledger owns season-date/lock configuration, with no cyclic imports.

FOUND-07: Each AO has stable `aoId`, display name, one unique mapped Slack channel ID, active/inactive state, and independent weekly schedule. Require an `ao-` channel name at configuration; bind subsequent identity by channel ID. A renamed channel retains its existing mapping; flag loss of the naming convention to admins. Channel names are not tenant or AO keys. Unknown `ao-` channels do not automatically become selectable AOs: show a configuration notice without creating competition data.

FOUND-08: Model schedule as weekday → one or more configured `HH:mm` defaults on selected workout weekdays; other days may have none. Each active AO must have an admin-confirmed weekly schedule for setup readiness. Different days/times and multiple workouts per weekday are supported, with duplicate slots rejected. These independent settings prefill entry references; they never schedule/synchronize official F3 workouts. A workout on a day with no default remains eligible if entered with an explicit time in a configured season.

FOUND-09: Admin Home manages region name, finite AOs/schedules, designated admins, versioned scoring bands and the automatic Backblast-reply toggle; ledger panels manage season dates and locks; reporting panels manage optional independent report automations. At priority 5, capture registers a separate admin entry-browser Home panel through the same extension point; foundation does not import its query/editor implementation. Use focused Save/Cancel configuration forms with validated drafts and audit. Inactive AOs remain in historical entries and corrections but disappear from new-entry choices. Never hard-delete referenced AOs, reuse their IDs or remove an entry's required AO reference. Display/schedule edits do not rewrite reference snapshots. Scoring/date changes follow the shared configuration contract: confirmed scoring edits recalculate open seasons through the ledger coordinator, while locked scores remain frozen.

FOUND-10: Treat region timezone changes after competition entry data exists as a controlled migration requiring separate review. V1 Home may change timezone only before first saved entry; afterward explain the restriction. Each season snapshots its timezone. A timezone change cannot bypass a locked season.

FOUND-11: V1 supports public AO channels only. Reject a private AO during configuration and capture; the bot must be invited to each supported channel rather than automatically joining arbitrary channels. Reject externally shared Slack Connect channels for ingestion, capture and sharing; do not allow a report to expose regional data to another workspace through a shared channel. Resolve channel metadata rather than guessing from ID prefixes. Report/capture destination checks also verify local membership and bot posting access.

FOUND-12: Required manifest capabilities: slash command `/yeti`, interactivity, App Home and `app_home_opened`, public `message.channels`, plus installation revocation/uninstall handling as supported by the selected Bolt version. Minimum proposed bot scopes: `commands`, `chat:write`, `channels:history`, `channels:read`, `users:read`. Private AO support is deferred; do not request `groups:history`/`groups:read` or subscribe to `message.groups` in V1. No user OAuth scopes, email access, `chat:write.public`, message impersonation or broad admin scopes. At implementation verify each scope/event against the official manifest/API reference before finalizing the manifest. Public history is needed for message events, not blanket historical harvesting.

FOUND-13: On uninstall/revocation, disable handlers and credential use promptly and delete/revoke stored tokens. Retain competition entries, seasons, revisions and audit history indefinitely; uninstall is not a deletion request and must not start a history-expiry timer. Reinstall can reactivate the same tenant after authorization. Exceptional deletion requires a documented explicit administrative process, distinct from the app's Archive action; no hard-delete command is introduced.

FOUND-14: Run one centrally operated V1 service on DigitalOcean App Platform with managed MongoDB, serving isolated workspace installations through the same deployment. Start near the confirmed approximately USD $25/month budget, then validate actual sizing/transaction support and measured load. Use the official MongoDB driver with module-local repositories and Zod under the [shared persistence contract](SPEC-common.md#persistence-and-runtime-validation), keeping every tenant predicate from FOUND-04; central operation never authorizes cross-region access. Follow the [deployment decision](deployment-options.md) for checks-gated automatic `main` deployment, rollback and backup/recovery verification.

## Data ownership and provider contracts

Foundation provides the shared driver connection/session lifecycle and index-provisioning infrastructure. It owns repositories and Zod document schemas for its own collections; downstream modules retain ownership of theirs. Construct tenant-scoped repositories only from validated context, keeping installation resolution internal to foundation. Expose plain configuration/identity types to consumers, without leaking `Db`, `Collection` or unrestricted query access through provider contracts. Transaction sessions may be coordinated internally across providers for the existing configuration/ledger fence protocol.

| Collection | Essential fields / constraints |
|---|---|
| `installations` | Unique `teamId`; verified `appId`, encrypted bot credentials, installer, active state |
| `regions` | Unique `teamId` and `regionId`; name, timezone, admin IDs, config/confirmation revision, applied and desired/pending scoring policy references with application status, automaticBackblastRepliesEnabled (default true), conditional trusted source app/bot IDs |
| `scoringPolicies` | Tenant keys, immutable policy ID/revision, variable-length bands, author/time |
| `aos` | Tenant keys, `aoId`, channel ID, name, active flag, weekday slots, config version |
| `operationalJobs` | Tenant keys, operation key, type, status, attempts, lease expiry, safe payload reference; unique tenant/operation key |

Proposed unique indexes: `{teamId:1}`, `{teamId:1,regionId:1,aoId:1}`, `{teamId:1,regionId:1,channelId:1}`, and `{teamId:1,regionId:1,operationKey:1}` in their relevant collections. Configuration saves use expected-version checks and audit. Credentials and operational bodies are never exposed to module consumers.

Foundation provides:

```text
resolveWorkspaceContext(verifiedSlackEnvelope) → WorkspaceContext
requireMember(context, userId) → LocalMember
requireAdmin(context) → void or NOT_FOUND_OR_FORBIDDEN
getRegion(context) → RegionConfig
getSetupStatus(context) → SetupStatus
assertConfigured(context, expectedConfigurationRevision?) → ReadyConfiguration
registerSetupCheck(readOnlyProvider) → composition-root registration
getScoringPolicy(context, policyId, revision) → ScoringPolicy
saveScoringPolicy(context, expectedVersion, bands) → ProposedScoringPolicyRevision
setAutomaticBackblastReplies(context, enabled, expectedVersion) → RegionConfig
getAoByChannel(context, channelId) → Ao | null
listAos(context, includeInactive) → Ao[]
getScheduleCandidates(context, aoId, localDate) → LocalTime[]
saveRegionConfig(context, expectedVersion, patch) → RegionConfig
registerHomePanel(provider) → composition-root registration
enqueueOperation(context, operationKey, type, payloadRef) → OperationReceipt
```

Context is opaque outside foundation; consumers cannot construct a trustworthy context by copying fields from form state. Admin/config validation runs inside provider methods, not only in listeners. `registerHomePanel` accepts provider callbacks from the composition root without foundation importing downstream modules. Operational jobs store minimal data, are tenant-scoped, and must not become an alternate unrestricted entry-write interface.

## Runtime and reliability

HTTP ingress exposes Slack request handling, OAuth install/callback, `/health/live` and `/health/ready`. Liveness tests process health; readiness verifies deployment configuration and database connectivity without exposing tenant details; incomplete region setup is reported per tenant, not as a global HTTP readiness failure. Listen on configured PORT, support SIGTERM and stop accepting work before draining. In production, MongoDB data and keys live outside container ephemeral storage; the explicitly selected local ephemeral mode is disposable.

Use a transaction-capable replica set in all modes. For local development/integration tests support ephemeral `MongoMemoryReplSet` (real mongod, WiredTiger) and a local Docker replica set; a repository mock or standalone Mongo container is insufficient. Memory mode is disposable, starts/stops with the dev/test process and is never used in production. Compose must initialize its optional local replica set automatically. Production uses TLS/authentication and least-privilege DB credentials, index provisioning, backups and a tested restore procedure. [MongoDB transactions](https://www.mongodb.com/docs/manual/core/transactions/)

For accepted events/actions, persist necessary operation intent before acknowledging success; do not rely on an in-memory promise after responding. Distinguish Slack transport acknowledgment from completed entry save. The App Platform container runs a durable job/outbox dispatcher with expiring leases within the long-lived process initially; MongoDB stores durable state. A separate worker is a later sizing choice, not an initial service dependency. See [the deployment decision](deployment-options.md).

Log request/operation IDs, latency, tenant pseudonymous IDs, result codes and retry counts. Do not log tokens, response URLs, raw rosters or Backblast prose. Track acknowledgment latency, rejected signatures, DB failures, parsing warnings, duplicate suppression and outbox backlog. Rate-limit Slack calls per installation; honor Retry-After with bounded backoff and terminal error visibility.

When priority 6 is implemented, runtime adapters must also wake the reporting due-run dispatcher independently of Slack events, at least once per minute under healthy operation. Persist schedule/run state and use leases across replicas; a wakeup is not itself a report authorization. Provide a server-side context resolver for validated persisted automation jobs, limited to read/report delivery within that installation/region. Never forge an interactive actor or use this context for entry mutations. The always-running App Platform process supplies the wakeup; polling only while an HTTP request happens to be active is insufficient. The reporting module owns schedule semantics and season cutoffs, not foundation.

Automatic database backups and an operator restore procedure target no more than 24 hours of lost changes and service recovery within one business day. Before launch, restore into an isolated environment and verify tenant isolation, seasons/locks, entries, audit and durable-operation recovery. Retain token-encryption keys securely outside ephemeral storage and document their recovery; restoring the database alone is insufficient. Competition-history retention is indefinite, independent of the backup retention window.

## Commands and verification

Future module command: `npm run test:module -- workspace-foundation`.
Full check: `npm run check`. Local runtime: `docker compose up --build --wait`.
Structure/style follow SPEC-common.md under `src/modules/workspace-foundation/` and corresponding tests.

## Success criteria

- FOUND-A1: Two workspace installations with identical labels remain isolated through every repository, cache, job and Home flow.
- FOUND-A2: Invalid signatures, foreign object IDs, forged admins, foreign users, revoked tokens and stale config updates fail closed.
- FOUND-A3: Installer bootstrap and admin changes work; reinstall preserves existing admins; removing final admin fails.
- FOUND-A4: Independently configured AO weekdays/times render correct candidates; schedule changes never rewrite history.
- FOUND-A5: A clean Docker stack initializes its replica set, becomes ready, survives restart with data intact and shuts down gracefully.
- FOUND-A6: Admin Home shows only authorized controls and downstream lock-panel integration creates no dependency cycle.

- FOUND-A7: Admin confirmation is required despite seeded defaults. All non-configuration slash commands list current missing settings privately; setup/admin commands remain accessible. Incomplete tenant setup never takes down other tenants.
- FOUND-A8: Per-region arbitrary-length scoring tables reject overlaps and invalid values; only admins activate settings. The reply toggle defaults ON; OFF preserves otherwise configured manual capture and does not require trusted F3 source identity.
- FOUND-A9: The ephemeral and Docker local DB modes both support real transactions and cleanup/isolation; production refuses ephemeral mode.

- FOUND-A10: A saved policy proposal alone does not claim application success. Admin impact confirmation is routed through the registered ledger coordinator without a foundation-to-ledger import; cancelled/stale proposals preserve applied settings and closed-season scores.

- FOUND-A11: The selected App Platform image connects to managed MongoDB over authenticated TLS and passes representative transaction, tenant, uniqueness and lock tests. HTTP and background work recover across redeployment without duplicate competition credit.
- FOUND-A12: An isolated restore drill records a recovery point within 24 hours before the simulated loss and service restoration within one business day. Uninstall removes credential access while preserving competition/audit history; reinstall retains the same authorized tenant data.

## Boundaries

Always enforce the shared contract. Ask before expanding scopes beyond required approved functionality, enabling org-wide installations or migrating a populated region timezone. Never persist production tokens in plain text or use a global fallback installation.

## Out of scope (deferred)

Private AO channels, Enterprise org-wide installation, cross-region admins, automatic channel discovery/joining, multi-timezone regions, and automatic restoration of departed-admin access through Slack commands.

## Open questions

Initial trusted F3 Nation Slack identity, the concrete secrets/key setup, operational contacts and restore evidence remain launch prerequisites in [the review register](decisions-and-open-questions.md). DigitalOcean hosting, indefinite competition-history retention and recovery targets are confirmed.

## Implementation task links

See [the complete issue index](implementation-tasks.md) and [execution plan](../../tasks/plan.md). The links below map this document’s requirements to implementation and verification work; they do not change requirement semantics or imply completion.

| Task / issue | Scope | Requirements / acceptance cases |
|---|---|---|
| [T01 #2](https://github.com/abobwhite/f3-yeti-man/issues/2) | Scaffold the official Bolt starter without overwriting repository content | FOUND-12 |
| [T04 #5](https://github.com/abobwhite/f3-yeti-man/issues/5) | Support real ephemeral and Docker MongoDB integration modes | FOUND-A5, FOUND-A9 |
| [T05 #6](https://github.com/abobwhite/f3-yeti-man/issues/6) | Persist encrypted multi-workspace OAuth installations | FOUND-01, FOUND-02, FOUND-13 |
| [T06 #7](https://github.com/abobwhite/f3-yeti-man/issues/7) | Enforce signed tenant, member and destination authorization | FOUND-03, FOUND-04, FOUND-11, FOUND-A1, FOUND-A2 |
| [T07 #8](https://github.com/abobwhite/f3-yeti-man/issues/8) | Build the leased durable-operation and message-outbox runtime | FOUND-04 |
| [T10 #11](https://github.com/abobwhite/f3-yeti-man/issues/11) | Provide the required setup gate and minimal legitimate admin setup | FOUND-05, FOUND-06, FOUND-07, FOUND-08, FOUND-09 |
| [T15 #17](https://github.com/abobwhite/f3-yeti-man/issues/17) | Manage region settings, designated admins and reply mode in App Home | FOUND-05, FOUND-09, FOUND-10 |
| [T16 #18](https://github.com/abobwhite/f3-yeti-man/issues/18) | Configure independent AO channels and weekday time schedules | FOUND-07, FOUND-08, FOUND-09, FOUND-11 |
| [T18 #20](https://github.com/abobwhite/f3-yeti-man/issues/20) | Preview versioned scoring-policy changes and affected open seasons | FOUND-A10 |
| [C2 #24](https://github.com/abobwhite/f3-yeti-man/issues/24) | Verify complete admin configuration and scoring lifecycle | FOUND-A3, FOUND-A4, FOUND-A6, FOUND-A7, FOUND-A8, FOUND-A10 |
| [T24 #29](https://github.com/abobwhite/f3-yeti-man/issues/29) | Capture verified F3 source identity and sanitized event fixtures | FOUND-12 |
| [T27 #32](https://github.com/abobwhite/f3-yeti-man/issues/32) | Receive trusted F3 message events through a replay-safe inbox | FOUND-12 |
| [T40 #46](https://github.com/abobwhite/f3-yeti-man/issues/46) | Expose privacy-safe operational health and actionable failures | FOUND-03, FOUND-04, FOUND-14 |
| [T41 #47](https://github.com/abobwhite/f3-yeti-man/issues/47) | Build the portable production Docker image and local app stack | FOUND-14, FOUND-A5, FOUND-A11 |
| [T43 #49](https://github.com/abobwhite/f3-yeti-man/issues/49) | Define App Platform automatic promotion and application rollback | FOUND-14, FOUND-A11 |
| [T44A #50](https://github.com/abobwhite/f3-yeti-man/issues/50) | Document and enforce indefinite competition retention and credential removal | FOUND-02, FOUND-13 |
| [T44B #51](https://github.com/abobwhite/f3-yeti-man/issues/51) | Prepare monitored backups and a tested isolated restore procedure | FOUND-A12 |
| [C7 #62](https://github.com/abobwhite/f3-yeti-man/issues/62) | Verify production readiness, regional isolation and recovery on the selected host | FOUND-A1, FOUND-A2, FOUND-A3, FOUND-A4, FOUND-A5, FOUND-A6, FOUND-A7, FOUND-A8, FOUND-A9, FOUND-A10, FOUND-A11, FOUND-A12 |
