export interface RuntimeConfig {
  signingSecret: string;
  clientId: string;
  clientSecret: string;
  appId: string;
  tokenEncryptionKeysJson: string;
  port: number;
  slackApiUrl: string | undefined;
}

export function readRuntimeConfig(
  environment: Readonly<Record<string, string | undefined>>,
): RuntimeConfig {
  const signingSecret = environment.SLACK_SIGNING_SECRET;
  const clientId = environment.SLACK_CLIENT_ID;
  const clientSecret = environment.SLACK_CLIENT_SECRET;
  const appId = environment.SLACK_APP_ID;
  const tokenEncryptionKeysJson = environment.TOKEN_ENCRYPTION_KEYS_JSON;
  if (!signingSecret || !clientId || !clientSecret || !appId || !tokenEncryptionKeysJson) {
    throw new Error(
      'Set Slack OAuth credentials, SLACK_APP_ID, and TOKEN_ENCRYPTION_KEYS_JSON before starting the app.',
    );
  }

  const port = Number(environment.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError('PORT must be an integer from 1 to 65535.');
  }

  return {
    signingSecret,
    clientId,
    clientSecret,
    appId,
    tokenEncryptionKeysJson,
    port,
    slackApiUrl: environment.SLACK_API_URL,
  };
}
