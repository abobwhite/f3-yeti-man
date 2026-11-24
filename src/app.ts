import { App, ExpressReceiver } from '@slack/bolt';
import { config } from 'dotenv';
import {
  connectDatabase,
  databaseMode,
  requireProductionDatabase,
} from './modules/workspace-foundation/database.ts';
import { readRuntimeConfig } from './shared/runtime-config.ts';

config();

const { botToken, signingSecret, port, slackApiUrl } = readRuntimeConfig(process.env);
const uri = process.env.MONGODB_URI;
requireProductionDatabase(process.env);
const database = uri
  ? await connectDatabase({
      mode: databaseMode(process.env.DEV_DB_MODE),
      uri,
      databaseName: process.env.MONGODB_DATABASE ?? 'f3_yeti_dev',
    })
  : undefined;

const receiver = new ExpressReceiver({ signingSecret });
receiver.router.get('/health/live', (_request, response) => response.sendStatus(200));

export const app = new App({
  token: botToken,
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

try {
  await app.start(port);
  app.logger.info('Yeti Man Bolt HTTP starter is running.');
} catch (error) {
  await database?.close();
  app.logger.error('Failed to start the Bolt HTTP starter.', error);
  process.exitCode = 1;
}
