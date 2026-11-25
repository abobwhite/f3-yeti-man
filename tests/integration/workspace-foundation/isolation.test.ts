import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  type ChannelClient,
  requirePublicLocalDestination,
} from '../../../src/modules/workspace-foundation/channels.ts';
import { createWorkspaceContextProvider } from '../../../src/modules/workspace-foundation/context.ts';
import {
  provisionSlackRequestIndexes,
  verifySignedSlackRequest,
} from '../../../src/modules/workspace-foundation/ingress.ts';
import {
  requireMember,
  validateNewAttendees,
} from '../../../src/modules/workspace-foundation/members.ts';
import { createTenantScope } from '../../../src/modules/workspace-foundation/repository-scope.ts';
import { openIntegrationDatabase } from '../database-harness.ts';

const appId = 'AAPP1';

test('signed raw requests reject tampering, stale timestamps and replay', async () => {
  const harness = await openIntegrationDatabase();
  try {
    const { db } = harness.connection;
    await provisionSlackRequestIndexes(db);
    const now = new Date();
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const rawBody = Buffer.from('team_id=TONE&text=hello%20world');
    const signature = `v0=${createHmac('sha256', 'secret').update(`v0:${timestamp}:`).update(rawBody).digest('hex')}`;
    const valid = { rawBody, timestamp, signature, signingSecret: 'secret', db, now };
    await assert.rejects(
      verifySignedSlackRequest({ ...valid, rawBody: Buffer.from('tampered') }),
      /Invalid Slack/,
    );
    await assert.rejects(
      verifySignedSlackRequest({ ...valid, timestamp: String(Number(timestamp) - 301) }),
      /Stale Slack/,
    );
    await assert.rejects(
      verifySignedSlackRequest({ ...valid, timestamp: String(Number(timestamp) + 301) }),
      /Stale Slack/,
    );
    await assert.rejects(
      verifySignedSlackRequest({ ...valid, signature: 'v1=invalid' }),
      /Invalid Slack/,
    );
    await verifySignedSlackRequest(valid);
    await assert.rejects(verifySignedSlackRequest(valid), /Replayed Slack/);
  } finally {
    await harness.close();
  }
});

test('verified contexts isolate same labels, member and destination checks, and stale admins', async () => {
  const harness = await openIntegrationDatabase();
  try {
    const { db, client } = harness.connection;
    const installations = db.collection<{ _id: string; [key: string]: unknown }>('installations');
    await installations.insertMany([
      { _id: 'TONE', teamId: 'TONE', appId, installerUserId: 'UADMIN', active: true, botToken: {} },
      { _id: 'TTWO', teamId: 'TTWO', appId, installerUserId: 'UADMIN', active: true, botToken: {} },
    ]);
    const provider = createWorkspaceContextProvider(db, client, appId);
    const first = await provider.resolveWorkspaceContext({
      teamId: 'TONE',
      actorUserId: 'UADMIN',
      appId,
    });
    const second = await provider.resolveWorkspaceContext({
      teamId: 'TTWO',
      actorUserId: 'UADMIN',
      appId,
    });
    assert.notEqual(first.regionId, second.regionId);
    assert.throws(
      () => createTenantScope({ ...first }, provider.assertActive),
      /foundation-validated/,
    );
    await assert.rejects(
      provider.resolveWorkspaceContext({ teamId: 'TONE', actorUserId: 'UADMIN', appId: 'AOTHER' }),
      /Unexpected/,
    );

    const entries = db.collection<{ teamId: string; regionId: string; label: string }>('entries');
    await entries.insertMany([
      { teamId: first.teamId, regionId: first.regionId, label: 'Same AO' },
      { teamId: second.teamId, regionId: second.regionId, label: 'Same AO' },
    ]);
    const scope = createTenantScope(first, provider.assertActive);
    assert.equal(await entries.countDocuments(await scope.filter({ label: 'Same AO' })), 1);
    assert.equal(
      await entries.countDocuments(await scope.filter({ regionId: second.regionId })),
      0,
    );
    assert.equal(
      (
        await entries
          .aggregate(await scope.pipeline([{ $group: { _id: '$label', n: { $sum: 1 } } }]))
          .toArray()
      )[0]?.n,
      1,
    );
    assert.notEqual(
      await scope.cacheKey('same'),
      await createTenantScope(second, provider.assertActive).cacheKey('same'),
    );
    assert.deepEqual(await scope.tenantFields(), {
      teamId: first.teamId,
      regionId: first.regionId,
    });
    await assert.rejects(
      scope.pipeline([{ $lookup: { from: 'entries', as: 'foreign', pipeline: [] } }]),
      /unsupported/,
    );
    assert.throws(
      () => createTenantScope(undefined, provider.assertActive),
      /foundation-validated/,
    );

    const clientApi: ChannelClient = {
      users: {
        info: async ({ user }) => ({
          ok: true,
          user: { id: user, team_id: 'TONE', deleted: false, is_bot: false, name: 'Same name' },
        }),
      },
      conversations: {
        info: async ({ channel }) => ({
          ok: true,
          channel: {
            id: channel,
            name: 'ao-same',
            context_team_id: 'TONE',
            is_channel: true,
            is_private: false,
            is_ext_shared: false,
            is_pending_ext_shared: false,
            is_shared: false,
            is_member: true,
          },
        }),
        members: async () => ({ ok: true, members: ['UADMIN'] }),
      },
    };
    assert.equal(
      (await requireMember(first, 'UADMIN', clientApi, provider.assertActive)).displayName,
      'Same name',
    );
    await assert.rejects(
      requireMember(second, 'UADMIN', clientApi, provider.assertActive),
      /eligible local/,
    );
    const deletedClient: ChannelClient = {
      ...clientApi,
      users: {
        info: async ({ user }) => ({
          ok: true,
          user: { id: user, team_id: 'TONE', deleted: true, is_bot: false },
        }),
      },
    };
    await assert.rejects(
      requireMember(first, 'UADMIN', deletedClient, provider.assertActive),
      /eligible local/,
    );
    const appUserClient: ChannelClient = {
      ...clientApi,
      users: {
        info: async ({ user }) => ({
          ok: true,
          user: { id: user, team_id: 'TONE', deleted: false, is_app_user: true },
        }),
      },
    };
    await assert.rejects(
      requireMember(first, 'UADMIN', appUserClient, provider.assertActive),
      /eligible local/,
    );
    await validateNewAttendees(first, ['UOLD'], ['UOLD'], clientApi, provider.assertActive);
    const botClient: ChannelClient = {
      ...clientApi,
      users: {
        info: async ({ user }) => ({
          ok: true,
          user: { id: user, team_id: 'TONE', deleted: false, is_bot: true },
        }),
      },
    };
    await assert.rejects(
      validateNewAttendees(first, ['UBOT'], [], botClient, provider.assertActive),
      /eligible local/,
    );
    await requirePublicLocalDestination(
      first,
      'CLOCAL',
      'UADMIN',
      clientApi,
      provider.assertActive,
    );
    for (const patch of [
      { is_private: true },
      { is_ext_shared: true },
      { is_member: false },
      { context_team_id: 'TTWO' },
      { is_pending_ext_shared: true },
      { is_shared: true },
      { is_archived: true },
      { is_frozen: true },
      { is_read_only: true },
      { is_channel: false },
      { is_org_shared: true },
      { id: 'CFOREIGN' },
      { is_private: undefined },
      { is_ext_shared: undefined },
      { is_pending_ext_shared: undefined },
      { is_shared: undefined },
      { is_member: undefined },
    ]) {
      const unsafe: ChannelClient = {
        ...clientApi,
        conversations: {
          ...clientApi.conversations,
          info: async ({ channel }) => ({
            ...(await clientApi.conversations.info({ channel })),
            channel: { ...(await clientApi.conversations.info({ channel })).channel, ...patch },
          }),
        },
      };
      await assert.rejects(
        requirePublicLocalDestination(first, 'CLOCAL', 'UADMIN', unsafe, provider.assertActive),
        /Destination/,
      );
    }
    const missingChannel: ChannelClient = {
      ...clientApi,
      conversations: {
        ...clientApi.conversations,
        info: async () => ({ ok: true }),
      },
    };
    await assert.rejects(
      requirePublicLocalDestination(
        first,
        'CLOCAL',
        'UADMIN',
        missingChannel,
        provider.assertActive,
      ),
      /Destination/,
    );
    const notMember: ChannelClient = {
      ...clientApi,
      conversations: {
        ...clientApi.conversations,
        members: async () => ({ ok: true, members: [] }),
      },
    };
    await assert.rejects(
      requirePublicLocalDestination(first, 'CLOCAL', 'UADMIN', notMember, provider.assertActive),
      /not a channel member/,
    );
    const failedMembership: ChannelClient = {
      ...clientApi,
      conversations: {
        ...clientApi.conversations,
        members: async () => ({ ok: false }),
      },
    };
    await assert.rejects(
      requirePublicLocalDestination(
        first,
        'CLOCAL',
        'UADMIN',
        failedMembership,
        provider.assertActive,
      ),
      /Unable to verify channel membership/,
    );
    await assert.rejects(
      requirePublicLocalDestination(first, 'CLOCAL', 'UOTHER', clientApi, provider.assertActive),
      /Actor does not match/,
    );

    await provider.requireAdmin(first);
    const revocation = client.startSession();
    try {
      revocation.startTransaction();
      await db
        .collection('regions')
        .updateOne(
          { teamId: 'TONE' },
          { $set: { adminUserIds: ['UOTHER'] } },
          { session: revocation },
        );
      const pendingCommit = provider.withAdminCommit(first, async () => true);
      await revocation.commitTransaction();
      await assert.rejects(pendingCommit, /NOT_FOUND_OR_FORBIDDEN/);
    } finally {
      await revocation.endSession();
    }
    await assert.rejects(
      provider.withAdminCommit(first, async () => true),
      /NOT_FOUND_OR_FORBIDDEN/,
    );
    await installations.updateOne({ _id: 'TONE' }, { $set: { active: false } });
    await assert.rejects(provider.assertActive(first), /No active installation/);
    await assert.rejects(scope.filter({}), /No active installation/);
    await assert.rejects(scope.cacheKey('same'), /No active installation/);
    await assert.rejects(
      validateNewAttendees(first, ['UOLD'], ['UOLD'], clientApi, provider.assertActive),
      /No active installation/,
    );
  } finally {
    await harness.close();
  }
});
