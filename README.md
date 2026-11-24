# f3-yeti-man
An app to support tracking F3 Yeti Man data and ways to read/write it - initially via a Slack app

## Bolt HTTP starter

This minimal TypeScript entrypoint is adapted from the [official non-AI Bolt starter](https://github.com/slack-samples/bolt-js-starter-template). The Slack CLI scaffold was created in a temporary directory and only the app-specific starter files were brought into this repository.

Tested locally with Node.js 24.22.3, npm 11.19.1, Slack CLI 4.14.0, TypeScript 7.0.2, Biome 2.6.9, `@slack/bolt` 5.1.0 and `dotenv` 18.0.9. The exact dependency tree is in `package-lock.json`.

1. Use an isolated Slack developer workspace and configure a Slack app from `manifest.json`. Replace all `https://example.com/slack/events` URLs with the public HTTPS URL for this service before creating or updating an app. All Slack requests use Bolt's `/slack/events` route. The Home tab, public channel event subscription and interactivity are registered for later feature tasks; `/yeti` currently gives a setup placeholder response.
2. Copy `.env.example` to `.env` and fill in the bot token and signing secret from that development app. Keep `.env` untracked. No app token is needed because this starter uses HTTP rather than Socket Mode.
3. Run `npm ci`, then `npm run dev` for a temporary local MongoDB replica set, or `npm run dev:docker-db` for a Docker replica set with a persistent development volume. Both run the TypeScript source in Node 24 watch mode. The app listens on `PORT` (default 3000); check `http://localhost:3000/health/live` for HTTP 200.

An isolated Slack installation and a reachable HTTPS endpoint are required for an end-to-end Slack smoke test. The placeholder manifest URLs are intentionally not a deployable endpoint.

## Verification

Run `npm run check` for typecheck, read-only Biome lint/format checks, production build, unit tests, coverage, and memory replica set integration tests. Run `npm run test:integration:docker` for the same integration assertions against Docker. `npm run format` applies Biome fixes intentionally. Unit tests make no network requests. Integration tests bind loopback ports, use a mock Slack API, and create a unique database per test. Their cleanup drops only that generated database. The harness rejects production mode, configured database names, remote MongoDB URIs, and credentials.

## MongoDB modes

`npm run dev` downloads and caches MongoDB 8.0.30 on first use, then starts a one member `MongoMemoryReplSet` with WiredTiger. It stops when the development app exits. Set `MONGOMS_DOWNLOAD_DIR` to choose a binary cache directory, or `MONGOMS_SYSTEM_BINARY` to use an already installed compatible `mongod` when offline. Keep the binary version at 8.0.30; see `MONGOD_VERSION` in `src/modules/workspace-foundation/database.ts`. The first online run can populate the cache for later offline use.

`npm run dev:docker-db` starts `mongo:8.0.30` via `compose.yaml`. Docker stores data in the named `mongo-dev-data` volume. After stopping the app, run `docker compose down` to stop/remove the container and network while retaining the volume; avoid `--volumes` if you want to keep development data. Use `docker compose up -d --wait mongo` to resume it. The Docker URI is `mongodb://127.0.0.1:27017/?replicaSet=rs0&directConnection=true`.

Production uses an externally managed MongoDB deployment: set `NODE_ENV=production`, `DEV_DB_MODE=external`, `MONGODB_URI`, and `MONGODB_DATABASE`, run `npm run build`, then `npm start`. Production startup rejects memory and Docker modes and checks the MongoDB connection before the HTTP server starts.

`npm run test:coverage` includes application TypeScript and fails if any source file is absent from its report or if aggregate coverage falls below 90% of lines or 85% of branches. The report names scoring, security, and lock invariant suites while those feature implementations are pending. `npm run test:module -- workspace-foundation` runs unit and integration tests for one approved module; the other approved IDs are `entry-ledger`, `entry-capture`, `f3-ingestion`, and `reporting`. Unknown IDs and modules without tests fail.

`npm run test:slack -- --workspace sandbox` is an explicit opt-in entrypoint. It currently fails with a clear message because the live sandbox smoke harness belongs to checkpoint C1; it is never part of `npm run check`.
