import assert from 'node:assert/strict';
import test from 'node:test';
import { readRuntimeConfig } from '../../../src/shared/runtime-config.ts';

const credentials = {
  SLACK_BOT_TOKEN: 'xoxb-test',
  SLACK_SIGNING_SECRET: 'test-signing-secret',
};

test('runtime config supplies the local HTTP port and keeps secrets out of errors', () => {
  assert.deepEqual(readRuntimeConfig(credentials), {
    botToken: 'xoxb-test',
    signingSecret: 'test-signing-secret',
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
  assert.throws(() => readRuntimeConfig({ SLACK_BOT_TOKEN: 'xoxb-test' }), /SLACK_SIGNING_SECRET/);
  assert.throws(() => readRuntimeConfig({ SLACK_SIGNING_SECRET: 'test' }), /SLACK_BOT_TOKEN/);
  for (const PORT of ['0', '-1', '65536', 'not-a-port', '3.5']) {
    assert.throws(() => readRuntimeConfig({ ...credentials, PORT }), /PORT must be an integer/);
  }
});
