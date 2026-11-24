# f3-yeti-man
An app to support tracking F3 Yeti Man data and ways to read/write it - initially via a Slack app

## Bolt HTTP starter (issue #2)

This minimal JavaScript entrypoint is adapted from the [official non-AI Bolt starter](https://github.com/slack-samples/bolt-js-starter-template). The Slack CLI scaffold was created in a temporary directory and only the app-specific starter files were brought into this repository. The TypeScript conversion and full check scripts are tracked in issues #3 and #4.

Tested locally with Node.js 24.22.3, npm 11.19.1, Slack CLI 4.14.0, `@slack/bolt` 5.1.0 and `dotenv` 18.0.9. The exact dependency tree is in `package-lock.json`.

1. Use an isolated Slack developer workspace and configure a Slack app from `manifest.json`. Replace all `https://example.com/slack/events` URLs with the public HTTPS URL for this service before creating or updating an app. All Slack requests use Bolt's `/slack/events` route. The Home tab, public channel event subscription and interactivity are registered for later feature tasks; `/yeti` currently gives a setup placeholder response.
2. Copy `.env.example` to `.env` and fill in the bot token and signing secret from that development app. Keep `.env` untracked. No app token is needed because this starter uses HTTP rather than Socket Mode.
3. Run `npm ci` and then `npm start`. The app listens on `PORT` (default 3000). Check `http://localhost:3000/health/live` for HTTP 200. `npm run dev` starts the same app in watch mode.

An isolated Slack installation and a reachable HTTPS endpoint are required for an end-to-end Slack smoke test. The placeholder manifest URLs are intentionally not a deployable endpoint.
