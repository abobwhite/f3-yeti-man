import { App, ExpressReceiver } from '@slack/bolt';
import { config } from 'dotenv';

config();

const { SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET } = process.env;
if (!SLACK_BOT_TOKEN || !SLACK_SIGNING_SECRET) {
  throw new Error('Set SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET before starting the app.');
}

const receiver = new ExpressReceiver({ signingSecret: SLACK_SIGNING_SECRET });
receiver.router.get('/health/live', (_request, response) => response.sendStatus(200));

const app = new App({
  token: SLACK_BOT_TOKEN,
  receiver,
  clientOptions: { slackApiUrl: process.env.SLACK_API_URL },
});

app.command('/yeti', async ({ ack }) => {
  await ack({ response_type: 'ephemeral', text: 'Yeti Man setup is in progress.' });
});

try {
  await app.start(Number(process.env.PORT ?? 3000));
  app.logger.info('Yeti Man Bolt HTTP starter is running.');
} catch (error) {
  app.logger.error('Failed to start the Bolt HTTP starter.', error);
  process.exitCode = 1;
}
