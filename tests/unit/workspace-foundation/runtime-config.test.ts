import assert from 'node:assert/strict';
import test from 'node:test';
import { readRuntimeConfig } from '../../../src/shared/runtime-config.ts';

const credentials = {
  SLACK_SIGNING_SECRET: 'test-signing-secret',
  SLACK_CLIENT_ID: '123.456',
  SLACK_CLIENT_SECRET: 'client-secret',
  SLACK_APP_ID: 'AAPP1',
  TOKEN_ENCRYPTION_KEYS_JSON: '{"current":"v1","keys":{"v1":"test"}}',
};

test('runtime config supplies the local HTTP port and keeps secrets out of errors', () => {
  assert.deepEqual(readRuntimeConfig(credentials), {
    signingSecret: 'test-signing-secret',
    clientId: '123.456',
    clientSecret: 'client-secret',
    appId: 'AAPP1',
    tokenEncryptionKeysJson: credentials.TOKEN_ENCRYPTION_KEYS_JSON,
    port: 3000,
    slackApiUrl: undefined,
  });
  assert.equal(readRuntimeConfig({ ...credentials, PORT: '4321' }).port, 4321);
  assert.equal(
    readRuntimeConfig({ ...credentials, SLACK_API_URL: 'http://127.0.0.1/api/' }).slackApiUrl,
    'http://127.0.0.1/api/',
  );
});

test('runtime config rejects missing credentials and invalid ports', () => {
  for (const key of Object.keys(credentials)) {
    const environment = { ...credentials } as Record<string, string>;
    delete environment[key];
    assert.throws(() => readRuntimeConfig(environment), /Slack OAuth credentials/);
  }
  for (const PORT of ['0', '-1', '65536', 'not-a-port', '3.5']) {
    assert.throws(() => readRuntimeConfig({ ...credentials, PORT }), /PORT must be an integer/);
  }
});
