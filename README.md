# f3-yeti-man
An app to support tracking F3 Yeti Man data and ways to read/write it - initially via a Slack app

## Bolt HTTP starter

This minimal TypeScript entrypoint is adapted from the [official non-AI Bolt starter](https://github.com/slack-samples/bolt-js-starter-template). The Slack CLI scaffold was created in a temporary directory and only the app-specific starter files were brought into this repository.

Tested locally with Node.js 24.22.3, npm 11.19.1, Slack CLI 4.14.0, TypeScript 7.0.2, Biome 2.6.9, `@slack/bolt` 5.1.0 and `dotenv` 18.0.9. The exact dependency tree is in `package-lock.json`.

1. Use an isolated Slack developer workspace and configure a Slack app from `manifest.json`. Replace all `https://example.com/slack/events` URLs with the public HTTPS URL for this service before creating or updating an app. All Slack requests use Bolt's `/slack/events` route. The Home tab, public channel event subscription and interactivity are registered for later feature tasks; `/yeti` currently gives a setup placeholder response.
2. Copy `.env.example` to `.env` and fill in the bot token and signing secret from that development app. Keep `.env` untracked. No app token is needed because this starter uses HTTP rather than Socket Mode.
3. Run `npm ci`, `npm run typecheck`, `npm run build`, then `npm start`. Production runs only the compiled `dist/app.js`. The app listens on `PORT` (default 3000). Check `http://localhost:3000/health/live` for HTTP 200. `npm run dev` runs the TypeScript source in Node 24 watch mode.

An isolated Slack installation and a reachable HTTPS endpoint are required for an end-to-end Slack smoke test. The placeholder manifest URLs are intentionally not a deployable endpoint.

## Verification

Run `npm run check` for typecheck, read-only Biome lint/format checks, production build, unit tests, coverage, and the current local HTTP integration smoke test. `npm run format` applies Biome fixes intentionally. Unit tests use Node's built-in runner and make no network requests. The integration smoke test binds loopback ports and uses a mock Slack API; the real MongoDB integration harness arrives in T04.

`npm run test:coverage` includes application TypeScript and fails if any source file is absent from its report or if aggregate coverage falls below 90% of lines or 85% of branches. The report names scoring, security, and lock invariant suites while those feature implementations are pending. `npm run test:module -- workspace-foundation` runs unit and integration tests for one approved module; the other approved IDs are `entry-ledger`, `entry-capture`, `f3-ingestion`, and `reporting`. Unknown IDs and modules without tests fail.

`npm run test:slack -- --workspace sandbox` is an explicit opt-in entrypoint. It currently fails with a clear message because the live sandbox smoke harness belongs to checkpoint C1; it is never part of `npm run check`.
