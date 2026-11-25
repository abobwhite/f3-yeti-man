import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import test from 'node:test';
import {
  BOT_SCOPES,
  createInstallationStore,
} from '../../../src/modules/workspace-foundation/installations.ts';
import { createTokenCipher } from '../../../src/modules/workspace-foundation/token-crypto.ts';
import { openIntegrationDatabase } from '../database-harness.ts';

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Expected a local TCP port.'));
        return;
      }
      resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test('HTTP starter serves liveness and rejects an unsigned Slack request', async () => {
  const harness = await openIntegrationDatabase();
  let oauthExchanges = 0;
  const slackApi = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    if (request.url?.endsWith('/oauth.v2.access')) {
      oauthExchanges += 1;
      response.end(
        JSON.stringify({
          ok: true,
          access_token: 'xoxb-oauth-install',
          token_type: 'bot',
          scope: BOT_SCOPES.join(','),
          bot_user_id: 'UTOAUTH',
          app_id: 'AAPP1',
          team: { id: 'TOAUTH', name: 'OAuth workspace' },
          enterprise: null,
          is_enterprise_install: false,
          authed_user: { id: 'UINSTALL1' },
        }),
      );
      return;
    }
    response.end(
      JSON.stringify({ ok: true, team_id: 'TOAUTH', user_id: 'UTOAUTH', bot_id: 'BTOAUTH' }),
    );
  });
  const slackApiPort = await listen(slackApi);
  const reservedPort = createServer();
  const appPort = await listen(reservedPort);
  await close(reservedPort);

  const keys = [
    'SLACK_SIGNING_SECRET',
    'SLACK_CLIENT_ID',
    'SLACK_CLIENT_SECRET',
    'SLACK_APP_ID',
    'TOKEN_ENCRYPTION_KEYS_JSON',
    'SLACK_API_URL',
    'PORT',
    'DEV_DB_MODE',
    'MONGODB_URI',
    'MONGODB_DATABASE',
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SLACK_SIGNING_SECRET: 'local-test-signing-secret',
    SLACK_CLIENT_ID: '123.456',
    SLACK_CLIENT_SECRET: 'local-client-secret',
    SLACK_APP_ID: 'AAPP1',
    TOKEN_ENCRYPTION_KEYS_JSON: JSON.stringify({
      current: 'v1',
      keys: { v1: Buffer.alloc(32, 7).toString('base64') },
    }),
    SLACK_API_URL: `http://127.0.0.1:${slackApiPort}/api/`,
    PORT: String(appPort),
    DEV_DB_MODE: harness.mode,
    MONGODB_URI: harness.uri,
    MONGODB_DATABASE: harness.connection.db.databaseName,
  });

  let stopApp: typeof import('../../../src/app.ts')['stopApp'] | undefined;
  try {
    ({ stopApp } = await import('../../../src/app.ts'));
    const store = createInstallationStore(
      harness.connection.db,
      'AAPP1',
      createTokenCipher(process.env.TOKEN_ENCRYPTION_KEYS_JSON as string),
    );
    const baseUrl = `http://127.0.0.1:${appPort}`;
    assert.equal((await fetch(`${baseUrl}/health/live`)).status, 200);
    const install = await fetch(`${baseUrl}/slack/install`);
    assert.equal(install.status, 200);
    const installPage = await install.text();
    assert.match(installPage, /slack\.com\/oauth\/v2\/authorize/);
    const state = /state=([0-9a-f]{64})/.exec(installPage)?.[1];
    const cookie = install.headers.get('set-cookie')?.split(';')[0];
    assert.ok(state);
    assert.ok(cookie);
    const callbackUrl = `${baseUrl}/slack/oauth_redirect?code=local-grant&state=${state}`;
    assert.equal((await fetch(callbackUrl, { headers: { cookie } })).status, 200);
    assert.equal(oauthExchanges, 1);
    assert.equal(
      (await store.fetchInstallation({ teamId: 'TOAUTH', isEnterpriseInstall: false })).bot?.token,
      'xoxb-oauth-install',
    );
    assert.equal((await fetch(callbackUrl, { headers: { cookie } })).status, 400);
    assert.equal(oauthExchanges, 1);
    const unsigned = await fetch(`${baseUrl}/slack/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'url_verification', challenge: 'not-trusted' }),
    });
    assert.equal(unsigned.status, 401);

    for (const teamId of ['TLOCAL1', 'TLOCAL2']) {
      await store.storeInstallation({
        team: { id: teamId },
        enterprise: undefined,
        user: { id: 'UINSTALL1', token: undefined, scopes: undefined },
        bot: {
          id: `B${teamId}`,
          userId: `U${teamId}`,
          token: `xoxb-${teamId}`,
          scopes: [...BOT_SCOPES],
        },
        appId: 'AAPP1',
        tokenType: 'bot',
        isEnterpriseInstall: false,
        authVersion: 'v2',
      });
    }

    async function signedEvent(teamId: string, event: object): Promise<Response> {
      const body = JSON.stringify({
        token: 'event-token',
        team_id: teamId,
        api_app_id: 'AAPP1',
        event,
        type: 'event_callback',
        event_id: `Ev${teamId}`,
        event_time: Math.floor(Date.now() / 1000),
      });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac('sha256', 'local-test-signing-secret')
        .update(`v0:${timestamp}:${body}`)
        .digest('hex');
      return fetch(`${baseUrl}/slack/events`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-slack-request-timestamp': timestamp,
          'x-slack-signature': `v0=${signature}`,
        },
        body,
      });
    }

    assert.equal((await signedEvent('TLOCAL1', { type: 'app_uninstalled' })).status, 200);
    async function expectRevoked(teamId: string): Promise<void> {
      const record = await harness.connection.db
        .collection('installations')
        .findOne({ _id: teamId });
      assert.equal(record?.active, false);
      assert.equal('botToken' in (record ?? {}), false);
      await assert.rejects(
        store.fetchInstallation({ teamId, isEnterpriseInstall: false }),
        /No active installation/,
      );
    }
    await expectRevoked('TLOCAL1');
    assert.equal(
      (await store.fetchInstallation({ teamId: 'TLOCAL2', isEnterpriseInstall: false })).bot?.token,
      'xoxb-TLOCAL2',
    );
    assert.equal(
      (await signedEvent('TLOCAL2', { type: 'tokens_revoked', tokens: { bot: ['UTLOCAL2'] } }))
        .status,
      200,
    );
    await expectRevoked('TLOCAL2');
  } finally {
    if (stopApp) await stopApp();
    await close(slackApi);
    await harness.close();
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
