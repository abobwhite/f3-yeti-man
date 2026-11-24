export interface RuntimeConfig {
  botToken: string;
  signingSecret: string;
  port: number;
  slackApiUrl: string | undefined;
}

export function readRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>>,
): RuntimeConfig {
  const botToken = environment.SLACK_BOT_TOKEN;
  const signingSecret = environment.SLACK_SIGNING_SECRET;
  if (!botToken || !signingSecret) {
    throw new Error('Set SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET before starting the app.');
  }

  const port = Number(environment.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError('PORT must be an integer from 1 to 65535.');
  }

  return { botToken, signingSecret, port, slackApiUrl: environment.SLACK_API_URL };
}
