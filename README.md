# f3-yeti-man
An app to support tracking F3 Yeti Man data and ways to read/write it - initially via a Slack app

For scoped implementation work, start with [repository guidance](AGENTS.md), the [selective spec index](SPEC_INDEX.md) and the [current handoff](PROGRESS.md). The [Codex workflow](docs/codex-workflow.md) covers chat boundaries, cache-aware context and targeted verification.

## Bolt HTTP starter

This minimal TypeScript entrypoint is adapted from the [official non-AI Bolt starter](https://github.com/slack-samples/bolt-js-starter-template). The Slack CLI scaffold was created in a temporary directory and only the app-specific starter files were brought into this repository.

Tested locally with Node.js 26.13.1, npm 12.2.3, Slack CLI 4.14.0, TypeScript 7.0.2, Biome 2.6.9, `@slack/bolt` 5.1.0 and `dotenv` 18.0.9. The exact dependency tree is in `package-lock.json`.

1. Use an isolated Slack developer workspace and configure a Slack app from `manifest.json`. Replace every `https://example.com` URL, including the OAuth redirect URL, with the public HTTPS URL for this service before creating or updating an app. Slack events and interactivity use Bolt's `/slack/events` route. The Home tab, public channel event subscription and interactivity are registered for later feature tasks; `/yeti` currently gives a setup placeholder response.
2. Copy `.env.example` to `.env` and fill in the signing secret, OAuth client ID/secret, app ID, and token encryption key ring from that development app. Keep `.env` untracked. There is no global bot token: each workspace supplies its own token through OAuth. No app token is needed because this starter uses HTTP rather than Socket Mode.
3. Run `npm ci`, then `npm run dev` for a temporary local MongoDB replica set, or `npm run dev:docker-db` for a Docker replica set with a persistent development volume. Both run the TypeScript source in Node 26 watch mode. The app listens on `PORT` (default 3000); check `http://localhost:3000/health/live` for HTTP 200.

An isolated Slack installation and a reachable HTTPS endpoint are required for an end-to-end Slack smoke test. The placeholder manifest URLs are intentionally not a deployable endpoint.

## Workspace OAuth and token keys

Configure Slack OAuth v2 with an allowed redirect URL of `https://<your-host>/slack/oauth_redirect`, then open `https://<your-host>/slack/install` to install into each workspace. The Express receiver verifies OAuth state, and MongoDB consumes it once within ten minutes. The app accepts individual workspace installs only, checks the Slack app ID and required bot scopes, and stores each workspace's bot token encrypted under its team ID. Reinstall replaces installation credentials while leaving other tenant records intact. `app_uninstalled` and bot `tokens_revoked` events deactivate the matching installation and remove its stored token; retain competition history separately.

Supply `TOKEN_ENCRYPTION_KEYS_JSON` through your deployment secret manager as a JSON object such as `{"current":"v1","keys":{"v1":"<base64-encoded 32-byte key>"}}`. Keep the key ring in external secret backups with access restricted to operators: a database backup alone cannot recover encrypted tokens. To rotate, add a new key ID and key while retaining old entries, set `current` to the new ID, and redeploy. New installs and reinstalls use the new key; existing installations still require their old keys until a reviewed re-encryption or reinstall is complete. Never remove an old key while any stored token references it. Never commit the key ring or copy it into MongoDB.

## Verification

Run `npm run check` for typecheck, read-only Biome lint/format checks, production build, unit tests, coverage, and memory replica set integration tests. Run `npm run test:integration:docker` for the same integration assertions against Docker. `npm run format` applies Biome fixes intentionally. Unit tests make no network requests. Integration tests bind loopback ports, use a mock Slack API, and create a unique database per test. Their cleanup drops only that generated database. The harness rejects production mode, configured database names, remote MongoDB URIs, and credentials.

## MongoDB modes

`npm run dev` downloads and caches MongoDB 8.0.30 on first use, then starts a one member `MongoMemoryReplSet` with WiredTiger. It stops when the development app exits. Set `MONGOMS_DOWNLOAD_DIR` to choose a binary cache directory, or `MONGOMS_SYSTEM_BINARY` to use an already installed compatible `mongod` when offline. Keep the binary version at 8.0.30; see `MONGOD_VERSION` in `src/modules/workspace-foundation/database.ts`. The first online run can populate the cache for later offline use.

`npm run dev:docker-db` starts `mongo:8.0.30` via `compose.yaml`. Docker stores data in the named `mongo-dev-data` volume. After stopping the app, run `docker compose down` to stop/remove the container and network while retaining the volume; avoid `--volumes` if you want to keep development data. Use `docker compose up -d --wait mongo` to resume it. The Docker URI is `mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true`.

Production uses an externally managed MongoDB deployment: set `NODE_ENV=production`, `DEV_DB_MODE=external`, `MONGODB_URI`, `MONGODB_DATABASE`, the Slack OAuth credentials and the externally managed encryption key ring; run `npm run build`, then `npm start`. Production startup rejects memory and Docker modes and checks the MongoDB connection before the HTTP server starts.

`npm run test:coverage` includes application TypeScript and fails if any source file is absent from its report or if aggregate coverage falls below 90% of lines or 85% of branches. The report names scoring, security, and lock invariant suites while those feature implementations are pending. `npm run test:module -- workspace-foundation` runs unit and integration tests for one approved module; the other approved IDs are `entry-ledger`, `entry-capture`, `f3-ingestion`, and `reporting`. Unknown IDs and modules without tests fail.

`npm run test:slack -- --workspace sandbox` is an explicit opt-in entrypoint. It currently fails with a clear message because the live sandbox smoke harness belongs to checkpoint C1; it is never part of `npm run check`.
