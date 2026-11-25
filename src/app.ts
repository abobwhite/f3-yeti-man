import { App, ExpressReceiver } from '@slack/bolt';
import { config } from 'dotenv';
import { Router, raw } from 'express';
import { createWorkspaceContextProvider } from './modules/workspace-foundation/context.ts';
import {
  connectDatabase,
  databaseMode,
  requireProductionDatabase,
} from './modules/workspace-foundation/database.ts';
import { createOperationDispatcher } from './modules/workspace-foundation/dispatcher.ts';
import {
  provisionSlackRequestIndexes,
  verifySignedSlackRequest,
} from './modules/workspace-foundation/ingress.ts';
import {
  BOT_SCOPES,
  createInstallationStore,
  createOAuthStateStore,
  provisionOAuthIndexes,
  revokeBotCredentials,
  revokeWorkspaceInstallation,
} from './modules/workspace-foundation/installations.ts';
import { requireMember } from './modules/workspace-foundation/members.ts';
import {
  createOperationRepository,
  provisionOperationIndexes,
} from './modules/workspace-foundation/operations.ts';
import { createTokenCipher } from './modules/workspace-foundation/token-crypto.ts';
import { readRuntimeConfig } from './shared/runtime-config.ts';

config();

const { signingSecret, clientId, clientSecret, appId, tokenEncryptionKeysJson, port, slackApiUrl } =
  readRuntimeConfig(process.env);
const uri = process.env.MONGODB_URI;
requireProductionDatabase(process.env);
if (!uri) throw new Error('MONGODB_URI is required for persistent Slack OAuth installations.');
const cipher = createTokenCipher(tokenEncryptionKeysJson);
const database = await connectDatabase({
  mode: databaseMode(process.env.DEV_DB_MODE),
  uri,
  databaseName: process.env.MONGODB_DATABASE ?? 'f3_yeti_dev',
});
try {
  await provisionOAuthIndexes(database.db);
  await provisionSlackRequestIndexes(database.db);
  await provisionOperationIndexes(database.db);
} catch (error) {
  await database.close();
  throw error;
}
const installationStore = createInstallationStore(database.db, appId, cipher);
const workspaceContexts = createWorkspaceContextProvider(database.db, database.client, appId);
const operations = createOperationRepository(database.db, workspaceContexts.assertActive);
// Downstream operation handlers are registered here as their owning modules land.
const dispatcher = createOperationDispatcher({
  repository: operations,
  handlers: {},
  onError: () => app.logger.error('Operation dispatcher failed.'),
});
const router = Router();
router.post(
  '/slack/events',
  raw({ type: '*/*', limit: '1mb' }),
  async (request, response, next) => {
    try {
      if (!Buffer.isBuffer(request.body)) throw new Error('Slack request body is unavailable.');
      await verifySignedSlackRequest({
        rawBody: request.body,
        timestamp: request.header('x-slack-request-timestamp'),
        signature: request.header('x-slack-signature'),
        signingSecret,
        db: database.db,
      });
      Object.assign(request, { rawBody: request.body });
      next();
    } catch (error) {
      response.sendStatus(
        error instanceof Error && /Slack request/.test(error.message) ? 401 : 503,
      );
    }
  },
);

const receiver = new ExpressReceiver({
  signingSecret,
  processBeforeResponse: true,
  clientId,
  clientSecret,
  scopes: [...BOT_SCOPES],
  installationStore,
  router,
  installerOptions: {
    authVersion: 'v2',
    stateStore: createOAuthStateStore(database.db),
    clientOptions: { slackApiUrl },
  },
});
receiver.router.get('/health/live', (_request, response) => response.sendStatus(200));

export const app = new App({
  receiver,
  clientOptions: { slackApiUrl },
});

export async function stopApp(): Promise<void> {
  dispatcher.stop();
  try {
    await app.stop();
  } finally {
    await database?.close();
  }
}

process.once('SIGTERM', () => {
  void stopApp().catch((error: unknown) => app.logger.error('Failed to stop the app.', error));
});

app.command('/yeti', async ({ ack, command, client }) => {
  const context = await workspaceContexts.resolveWorkspaceContext({
    teamId: command.team_id,
    actorUserId: command.user_id,
    appId,
  });
  await requireMember(context, command.user_id, client, workspaceContexts.assertActive);
  await ack({ response_type: 'ephemeral', text: 'Yeti Man setup is in progress.' });
});

app.event('app_uninstalled', async ({ body }) => {
  if (body.api_app_id !== appId) throw new Error('Unexpected Slack application ID.');
  await revokeWorkspaceInstallation(database.db, appId, body.team_id, body.event_time);
});

app.event('tokens_revoked', async ({ body, event }) => {
  if (body.api_app_id !== appId) throw new Error('Unexpected Slack application ID.');
  await revokeBotCredentials(
    database.db,
    appId,
    body.team_id,
    event.tokens.bot ?? [],
    body.event_time,
  );
});

try {
  await app.start(port);
  dispatcher.start();
  app.logger.info('Yeti Man Bolt HTTP starter is running.');
} catch (error) {
  await database?.close();
  app.logger.error('Failed to start the Bolt HTTP starter.', error);
  process.exitCode = 1;
}
