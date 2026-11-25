import { App, ExpressReceiver } from '@slack/bolt';
import { config } from 'dotenv';
import {
  connectDatabase,
  databaseMode,
  requireProductionDatabase,
} from './modules/workspace-foundation/database.ts';
import {
  BOT_SCOPES,
  createInstallationStore,
  createOAuthStateStore,
  provisionOAuthIndexes,
  revokeBotCredentials,
  revokeWorkspaceInstallation,
} from './modules/workspace-foundation/installations.ts';
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
} catch (error) {
  await database.close();
  throw error;
}
const installationStore = createInstallationStore(database.db, appId, cipher);

const receiver = new ExpressReceiver({
  signingSecret,
  processBeforeResponse: true,
  clientId,
  clientSecret,
  scopes: [...BOT_SCOPES],
  installationStore,
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
  try {
    await app.stop();
  } finally {
    await database?.close();
  }
}

process.once('SIGTERM', () => {
  void stopApp().catch((error: unknown) => app.logger.error('Failed to stop the app.', error));
});

app.command('/yeti', async ({ ack }) => {
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
  app.logger.info('Yeti Man Bolt HTTP starter is running.');
} catch (error) {
  await database?.close();
  app.logger.error('Failed to start the Bolt HTTP starter.', error);
  process.exitCode = 1;
}
