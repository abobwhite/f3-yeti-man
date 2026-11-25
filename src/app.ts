import { App, ExpressReceiver } from '@slack/bolt';
import { config } from 'dotenv';
import { provisionSeasonIndexes } from './modules/entry-ledger/season-repository.ts';
import {
  createSeasonProvider,
  registerSeasonAdminPanel,
  type SeasonAdminPanel,
} from './modules/entry-ledger/seasons.ts';
import {
  createConfigurationProvider,
  provisionConfigurationIndexes,
} from './modules/workspace-foundation/configuration.ts';
import { createWorkspaceContextProvider } from './modules/workspace-foundation/context.ts';
import {
  connectDatabase,
  databaseMode,
  requireProductionDatabase,
} from './modules/workspace-foundation/database.ts';
import { createOperationDispatcher } from './modules/workspace-foundation/dispatcher.ts';
import {
  createSlackIngressRouter,
  provisionSlackRequestIndexes,
} from './modules/workspace-foundation/ingress.ts';
import { registerInstallationHandlers } from './modules/workspace-foundation/installation-handlers.ts';
import {
  BOT_SCOPES,
  createInstallationStore,
  createOAuthStateStore,
  provisionOAuthIndexes,
} from './modules/workspace-foundation/installations.ts';
import {
  createOperationRepository,
  provisionOperationIndexes,
} from './modules/workspace-foundation/operations.ts';
import { registerSetupHandlers } from './modules/workspace-foundation/setup-handlers.ts';
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
  await provisionSeasonIndexes(database.db);
  await provisionConfigurationIndexes(database.db);
} catch (error) {
  await database.close();
  throw error;
}
const installationStore = createInstallationStore(database.db, appId, cipher);
const workspaceContexts = createWorkspaceContextProvider(database.db, database.client, appId);
const seasons = createSeasonProvider(database.db, workspaceContexts);
const configuration = createConfigurationProvider(database.db, workspaceContexts);
configuration.registerSetupCheck(seasons.rawSeasonReadiness);
export const adminPanels: { season?: SeasonAdminPanel } = {};
registerSeasonAdminPanel((panel) => {
  adminPanels.season = panel;
}, seasons);
const operations = createOperationRepository(database.db, workspaceContexts.assertActive);
// Downstream operation handlers are registered here as their owning modules land.
const dispatcher = createOperationDispatcher({
  repository: operations,
  handlers: {},
  onError: () => app.logger.error('Operation dispatcher failed.'),
});
const router = createSlackIngressRouter(database.db, signingSecret);

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

registerSetupHandlers({ app, appId, contexts: workspaceContexts, configuration, seasons });
registerInstallationHandlers(app, database.db, appId);

try {
  await app.start(port);
  dispatcher.start();
  app.logger.info('Yeti Man Bolt HTTP starter is running.');
} catch (error) {
  await database?.close();
  app.logger.error('Failed to start the Bolt HTTP starter.', error);
  process.exitCode = 1;
}
