# F3 Yeti Man — production deployment decision

Status: accepted hosting/operations direction for `workspace-foundation`, V1; implementation details and launch verification remain pending.
Decision date: 2026-11-23. Confirmed decisions: D42–D48 in [the review register](decisions-and-open-questions.md).

## Context and decision

Run one centrally operated, always-running Docker service on **DigitalOcean App Platform**, with **DigitalOcean managed MongoDB** outside the app container. All regions install the same Slack app into their own workspaces; installation credentials, configuration, competition facts, jobs and reports remain tenant-scoped. A new region does not require another production app/cluster. Retain Docker portability for possible future self-hosting without supporting a second V1 production adapter.

The user expects one region initially, with up to about three possible, about 500 active PAX in the described regions, roughly 2–3 Preblast/Backblast postings per day and fewer than 20 daily report requests. The PAX estimate is not explicitly per region. These are approximate workload forecasts, not configured limits or proof of peak capacity. Synthetic correctness/query datasets may be larger without being launch forecasts.

The confirmed stack is Node.js, TypeScript, Slack Bolt and the official MongoDB driver, with a small supporting dependency set. Detailed runtime/compiler, local database and dependency-version contracts remain in [SPEC-common.md](SPEC-common.md). There is no need to introduce a separate cache or queue service for the initial workload: MongoDB persists inbox/outbox, leases and schedule/run state.

## Alternatives considered

| Option | Value and tradeoff | V1 disposition |
|---|---|---|
| App Platform plus managed MongoDB | Managed infrastructure and database operations reduce maintenance; baseline monthly charges remain even with little traffic | Selected |
| Droplet hosting app and MongoDB | Lower initial infrastructure bill and full host control; operator maintains Linux, Docker, HTTPS, database upgrades, backups and recovery | Deferred; self-managed production servers excluded from V1 |
| Droplet plus managed MongoDB | Keeps database operation managed but retains server administration for little baseline saving | Not selected |
| Managed serverless containers, for example Cloud Run | Can preserve the Docker image, but introduces lifecycle/scaling and independent durable-dispatch requirements | Deferred; no separate serverless implementation in V1 |
| AWS Lambda plus API Gateway | Usage-based compute with receiver/OAuth adapter and durable queue/lifecycle work | Deferred |
| Socket Mode on a persistent host | Convenient local development without public event ingress; still needs OAuth distribution endpoints | Optional sandbox development only |

The earlier open hosting assessment is superseded by the user's managed-platform choice. The deferred serverless constraints remain relevant to a future delta spec: preserve signed raw request bodies, OAuth and Slack acknowledgment timing; use external durable wakeups; bound MongoDB connections; and prove restart/retry behavior. See [Cloud Run's container contract](https://docs.cloud.google.com/run/docs/container-contract), [minimum instances](https://docs.cloud.google.com/run/docs/configuring/min-instances) and [Bolt's OAuth-aware Lambda guidance](https://docs.slack.dev/tools/bolt-js/deployments/aws-lambda/). V1 does not need tests against a second production platform.

## Initial topology and budget

Start with one web container, including the leased inbox/outbox dispatcher, connected to the managed database. Colocate compute/database where supported, use authenticated TLS and restricted database access, and reuse a bounded driver connection pool. Application health/readiness and database backups are independent of a region's setup-completion status.

Dated planning estimate, checked 2026-11-23, USD per month:

| Component | Initial sizing assumption | Estimate |
|---|---|---:|
| App Platform web service | One shared-CPU container, 1 GiB RAM | $10.00 |
| Managed MongoDB | One basic 1 GiB node at advertised starting storage | $15.23 |
| Total baseline | One shared service for the initial regional installations | **$25.23** |

These figures come from [App Platform pricing](https://docs.digitalocean.com/products/app-platform/details/pricing/) and [managed database pricing](https://www.digitalocean.com/pricing/managed-databases). Approximately $25/month is a confirmed starting budget direction, not a spending guarantee or hard cap. The estimate excludes taxes, a custom domain, extra database storage, optional registry/logging/backup services and additional workers. Validate actual costs and memory/connection use before launch. A measured 512 MiB app could reduce compute to $5/month; that is an optional optimization, not the baseline requirement. A separate worker adds its chosen container charge.

The inexpensive single-node MongoDB tier is **not highly available**; provider management does not supply redundant nodes at this price. The user accepted the low-cost managed baseline and recovery targets, not a zero-downtime guarantee. Verify transaction-capable replica-set behavior and the required atomic save/lock/index operations on the selected production plan before launch. If it cannot satisfy these invariants, revise sizing and cost rather than replacing transactions with unsafe writes. Higher availability requires a separately costed decision. [MongoDB plan distinctions](https://docs.digitalocean.com/products/databases/mongodb/details/pricing/)

## Required Docker behavior

- Multi-stage build installs lockfile dependencies, typechecks and compiles TypeScript; runtime contains production dependencies and compiled `dist/` files only. Pin the Node patch/image digest, run as non-root, supply secrets externally and log to stdout/stderr.
- Build the production artifact for Linux AMD64, which App Platform currently requires. A local development build may target its host separately. [Container image requirements](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-container-images/)
- Bind `0.0.0.0:$PORT`; expose `/health/live` and `/health/ready`; preserve Slack raw-body signature verification and OAuth install/callback routing. Use managed HTTPS ingress and a stable configured public base URL.
- Handle SIGTERM by stopping new work, draining accepted work within the platform grace period and releasing/expiring leases safely. The database, credentials and encryption keys never depend on ephemeral container files.
- MongoDB lives outside the app container. Production must reject ephemeral database mode. Development/integration tests support both a real ephemeral `MongoMemoryReplSet` with WiredTiger and a persistent local Docker replica set.
- Provide safe configuration names in `.env.example`: `PORT`, `PUBLIC_BASE_URL`, `MONGODB_URI`, `MONGODB_DATABASE`, `DEV_DB_MODE` (`memory` or `docker`, local only), `SLACK_SIGNING_SECRET`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_STATE_SECRET` and an external token-encryption-key reference. A global bot token is not the multi-installation authorization model.
- Persist accepted operation intent before success acknowledgment. All workers recheck tenant context, record versions and season locks as applicable. Recover abandoned work through expiring leases and monitor failed/uncertain Slack delivery.

The local ephemeral path uses real mongod and may require an initial binary download. Pin/cache a compatible version or configure a preinstalled binary for restricted environments. [Memory-server configuration](https://typegoose.github.io/mongodb-memory-server/docs/api/config-options/)

Required future commands remain:

```sh
npm run dev
npm run dev:docker-db
npm run test:integration
npm run test:integration:docker
docker compose up --build --wait
docker build --tag f3-yeti-man:local .
docker compose down
```

The local image command does not define the CI production architecture/tagging procedure. Do not add `--volumes` to the normal stop command; it would remove local persisted data.

## Checks-gated automatic deployment and rollback

Merges to `main` trigger automatic production delivery after required checks pass; no routine manual release gate is required. During implementation:

1. Resolve the exact merged revision with `npm ci`, run `npm run check`, and build its production Docker image. All required checks must succeed before promotion; a failed check/build leaves production unchanged.
2. Promote that checked revision's immutable image/tag or digest to App Platform using a supported registry/integration. Disable any deployment trigger that could bypass the checks or deploy an unrelated moving tag. Keep production credentials outside source and untrusted pull-request execution. The specific CI vendor and registry remain implementation choices.
3. Verify readiness and HTTP/database operation after deployment; record revision/image identity and deployment outcome. Preserve the prior known-good image and a tested rollback procedure for failed readiness or a later regression.
4. Roll back application code independently of competition data. Never automatically restore the database as a code rollback. Schema/index changes must preserve compatibility with the rollback revision or have a separately reviewed migration/recovery procedure; destructive migrations are not an automatic deployment step.

Initial production launch also requires the opted-in Slack sandbox smoke tests from the common contract. Automatic delivery is a future implementation requirement, not authorization to provision or deploy during this specification change.

## Scheduled report execution

At priority 6, wake the due-report dispatcher at least once per minute under healthy operation, even when no Slack events arrive. Start with a periodic wakeup inside the always-running web process. MongoDB stores schedules, occurrence identities and leased work; an in-memory timer is not the durable schedule store. Multiple containers during a rollout must contend on the same leases and uniqueness constraints.

App Platform's native cron jobs currently have a minimum 15-minute interval, so they cannot alone satisfy the minute-level due-dispatch requirement. A separate always-running worker remains an optional later split with its own compute cost. [Job scheduling limits](https://docs.digitalocean.com/products/app-platform/how-to/manage-jobs/)

Every dispatch/retry revalidates region setup, the bound season dates, automation state, complete scoring generation and channel access. Preserve the existing at-most-one latest catch-up and no-new-post-after-season-end rules. Test execution without Slack activity, restart recovery, overlapping deployments and season cutoff on App Platform. See [the automation contract](automated-reports.md).

## Backups, recovery and history retention

The confirmed operating targets are no more than **24 hours of lost changes** and service restoration within **one business day**. Measure the recovery point against the incident/simulated-loss time, not the later time at which restoration finishes. These are application recovery objectives, not a DigitalOcean availability SLA. Name the recovery owner, escalation contact and applicable business-day/timezone convention before launch.

Use automatic managed-database backups and verify their successful completion/recoverable-point age. DigitalOcean documents daily MongoDB backups retained for seven days; confirm actual recovery options on the provisioned cluster. Alert when backups fail or the recovery point exceeds the 24-hour target. Schedule alone does not prove recoverability. [Managed MongoDB backup and restore](https://docs.digitalocean.com/products/databases/mongodb/how-to/restore-from-backups/)

Before launch, perform an isolated restore drill, measure elapsed recovery time and record the restored recovery point. Verify tenant isolation, admin/installation mappings, entries/attendance, AO and season references, locked-season rules, scoring-policy generations and audit/revisions. Prove that the selected plan supports the required transactions and indexes. Keep external Slack posting disabled during a drill. During an actual cutover, pause writes/dispatch, validate restored state and current installation authorization, expire stale leases, then resume durable work with current lock/season checks. Do not blindly replay uncertain Slack posts or resend schedules after the season cutoff.

Document database connection cutover, access to recoverable token-encryption keys and rotation/revocation handling. Restoring old credentials must not reactivate a known uninstalled/revoked installation; revalidate before enabling credential use. Keep a known-good app image/configuration available. Record any unmet target as a launch issue rather than claiming the managed provider guarantees it.

Retain completed seasons, active/archived entries, revisions, audit and supporting historical identity/configuration/scoring references **indefinitely**. This is the live competition-data retention policy; the provider's seven-day backup window is separate. Season end, lock, archive and app uninstall must not purge this history. Existing bounded drafts/report snapshots and safe operational cleanup still apply, preserving canonical source deduplication and audit facts. Uninstall promptly revokes/deletes tokens and disables work; it does not delete competition history.

Exceptional deletion requires an explicitly authorized administrative process with tenant scope, operator access, impact review and documented treatment of backup copies. The process must preserve other tenants and explain that a backup containing deleted data cannot be returned to service without reapplying authorized deletions. This is not an in-app hard-delete feature and does not change entry Archive/Restore semantics. The exact operator runbook, contacts, key storage, alerts and restore evidence are launch prerequisites; history duration and recovery objectives are already settled.

## Verification and remaining launch details

Record actual plan/location, memory, MongoDB connections, acknowledgment timing, report latency, backlog/retry behavior and cost under representative traffic. Do not require a larger tier solely because the synthetic query-test dataset exceeds the launch forecast, or silently relax correctness to fit the budget.

Deployment verification must demonstrate failure blocking promotion, passing-merge delivery, readiness failure recovery, application rollback without data rollback, multi-installation isolation, transaction/lock correctness and restart-safe workers. Recovery verification must demonstrate the 24-hour/one-business-day targets. Exact operator contacts, billing alerts/spend cap, domain, secrets/key recovery and explicit deletion procedure remain to be recorded before launch.

## Out of scope

Creating cloud accounts or paid resources in this documentation phase; production provisioning/deployment now; operating self-managed production servers; implementing a second serverless runtime; and claiming regional prices, measured performance or high availability without evidence. Future infrastructure/pipeline files belong to implementation, after the spec and plan are reviewed.

## Decision history

- 2026-11-23: Applied the confirmed technical interview, replacing the open hosting comparison with DigitalOcean App Platform plus managed MongoDB, a shared low-traffic service, approximately $25/month initial budget, checks-gated automatic deployment, explicit recovery objectives and indefinite competition-history retention. Deferred alternate production adapters while preserving Docker portability.
