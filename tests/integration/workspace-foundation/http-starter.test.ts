import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import test from 'node:test';
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
  const slackApi = createServer((_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({ ok: true, team_id: 'TLOCAL', user_id: 'ULOCAL', bot_id: 'BLOCAL' }),
    );
  });
  const slackApiPort = await listen(slackApi);
  const reservedPort = createServer();
  const appPort = await listen(reservedPort);
  await close(reservedPort);

  const keys = [
    'SLACK_BOT_TOKEN',
    'SLACK_SIGNING_SECRET',
    'SLACK_API_URL',
    'PORT',
    'DEV_DB_MODE',
    'MONGODB_URI',
    'MONGODB_DATABASE',
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    SLACK_BOT_TOKEN: 'xoxb-local-test',
    SLACK_SIGNING_SECRET: 'local-test-signing-secret',
    SLACK_API_URL: `http://127.0.0.1:${slackApiPort}/api/`,
    PORT: String(appPort),
    DEV_DB_MODE: harness.mode,
    MONGODB_URI: harness.uri,
    MONGODB_DATABASE: harness.connection.db.databaseName,
  });

  let stopApp: typeof import('../../../src/app.ts')['stopApp'] | undefined;
  try {
    ({ stopApp } = await import('../../../src/app.ts'));
    const baseUrl = `http://127.0.0.1:${appPort}`;
    assert.equal((await fetch(`${baseUrl}/health/live`)).status, 200);
    const unsigned = await fetch(`${baseUrl}/slack/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'url_verification', challenge: 'not-trusted' }),
    });
    assert.equal(unsigned.status, 401);
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
