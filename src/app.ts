import { App, ExpressReceiver } from '@slack/bolt';
import { config } from 'dotenv';
import { readRuntimeConfig } from './shared/runtime-config.ts';

config();

const { botToken, signingSecret, port, slackApiUrl } = readRuntimeConfig(process.env);

const receiver = new ExpressReceiver({ signingSecret });
receiver.router.get('/health/live', (_request, response) => response.sendStatus(200));

export const app = new App({
  token: botToken,
  receiver,
  clientOptions: { slackApiUrl },
});

app.command('/yeti', async ({ ack }) => {
  await ack({ response_type: 'ephemeral', text: 'Yeti Man setup is in progress.' });
});

try {
  await app.start(port);
  app.logger.info('Yeti Man Bolt HTTP starter is running.');
} catch (error) {
  app.logger.error('Failed to start the Bolt HTTP starter.', error);
  process.exitCode = 1;
}
