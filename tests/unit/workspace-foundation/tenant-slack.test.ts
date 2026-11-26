import assert from 'node:assert/strict';
import test from 'node:test';
import { createTenantSlackClients } from '../../../src/modules/workspace-foundation/tenant-slack.ts';

test('Slack adapters bind every member/channel request to its tenant token', async () => {
  const requests: unknown[] = [];
  const request = async (args: unknown) => {
    requests.push(args);
    return { ok: true };
  };
  const clients = createTenantSlackClients(
    { users: { info: request }, conversations: { info: request, members: request } } as never,
    {
      async fetchInstallation(query: { teamId: string }) {
        return { bot: { token: `test-${query.teamId}` } };
      },
    } as never,
  );
  const context = {
    teamId: 'TONE',
    regionId: crypto.randomUUID(),
    actorUserId: 'UADMIN',
    installationId: 'TONE',
  };
  const one = await clients.channels(context);
  const two = await clients.channels({ ...context, teamId: 'TTWO' });
  await one.users.info({ user: 'UPAX' });
  await two.conversations.info({ channel: 'CAO' });
  await one.conversations.members({ channel: 'CAO', cursor: 'cursor', limit: 100 });
  assert.deepEqual(requests, [
    { user: 'UPAX', token: 'test-TONE' },
    { channel: 'CAO', token: 'test-TTWO' },
    { channel: 'CAO', cursor: 'cursor', limit: 100, token: 'test-TONE' },
  ]);
});

test('missing installation tokens fail before a Slack request is initiated', async () => {
  const clients = createTenantSlackClients(
    {} as never,
    {
      async fetchInstallation() {
        return {};
      },
    } as never,
  );
  await assert.rejects(clients.token('TONE'), /INSTALLATION_UNAVAILABLE/);
});
