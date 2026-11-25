import assert from 'node:assert/strict';
import test from 'node:test';
import type { Installation, InstallationQuery } from '@slack/oauth';
import {
  BOT_SCOPES,
  createInstallationStore,
  createOAuthStateStore,
  provisionOAuthIndexes,
  revokeBotCredentials,
  revokeWorkspaceInstallation,
} from '../../../src/modules/workspace-foundation/installations.ts';
import { createTokenCipher } from '../../../src/modules/workspace-foundation/token-crypto.ts';
import { openIntegrationDatabase } from '../database-harness.ts';

const appId = 'AAPP1';
const cipher = createTokenCipher(
  JSON.stringify({ current: 'key1', keys: { key1: Buffer.alloc(32, 9).toString('base64') } }),
);

function installation(
  teamId: string,
  token: string,
  installerUserId = 'UINSTALL1',
): Installation<'v2', false> {
  return {
    team: { id: teamId, name: `Workspace ${teamId}` },
    enterprise: { id: 'EORG1', name: 'Shared organization' },
    user: { id: installerUserId, token: undefined, scopes: undefined },
    bot: { id: `B${teamId}`, userId: `U${teamId}`, token, scopes: [...BOT_SCOPES] },
    appId,
    tokenType: 'bot',
    isEnterpriseInstall: false,
    authVersion: 'v2',
  };
}

function query(teamId: string): InstallationQuery<false> {
  return { teamId, enterpriseId: 'EORG1', isEnterpriseInstall: false };
}

test('two workspace installations remain encrypted and isolated through reinstall and revocation', async () => {
  const harness = await openIntegrationDatabase();
  try {
    const { db } = harness.connection;
    await provisionOAuthIndexes(db);
    const store = createInstallationStore(db, appId, cipher);
    await store.storeInstallation(installation('TONE', 'xoxb-first'));
    await store.storeInstallation(installation('TTWO', 'xoxb-second'));

    const first = await store.fetchInstallation(query('TONE'));
    const second = await store.fetchInstallation(query('TTWO'));
    assert.equal(first.bot?.token, 'xoxb-first');
    assert.equal(second.bot?.token, 'xoxb-second');
    assert.equal(first.user.id, 'UINSTALL1');
    const raw = await db.collection('installations').findOne({ _id: 'TONE' });
    assert.ok(raw);
    assert.equal(raw.teamId, 'TONE');
    assert.equal(raw.appId, appId);
    assert.equal(raw.active, true);
    assert.equal(raw.botToken.keyId, 'key1');
    assert.equal(JSON.stringify(raw).includes('xoxb-first'), false);
    assert.equal('adminUserIds' in raw, false);
    const firstCreatedAt = raw.createdAt;

    await db
      .collection('installations')
      .updateOne(
        { _id: 'TONE' },
        { $set: { regionId: 'retained-region', adminUserIds: ['UORIGINAL'] } },
      );
    await store.storeInstallation(installation('TONE', 'xoxb-reinstalled', 'UNEWINSTALLER'));
    const reinstalled = await db.collection('installations').findOne({ _id: 'TONE' });
    assert.equal(reinstalled?.createdAt.getTime(), firstCreatedAt.getTime());
    assert.equal(reinstalled?.regionId, 'retained-region');
    assert.deepEqual(reinstalled?.adminUserIds, ['UORIGINAL']);
    assert.equal(reinstalled?.installerUserId, 'UNEWINSTALLER');
    assert.equal((await store.fetchInstallation(query('TONE'))).bot?.token, 'xoxb-reinstalled');

    await assert.rejects(
      store.fetchInstallation({
        teamId: 'TONE',
        enterpriseId: 'EOTHER',
        isEnterpriseInstall: false,
      }),
      /No active installation/,
    );
    await store.deleteInstallation?.(query('TONE'));
    await assert.rejects(store.fetchInstallation(query('TONE')), /No active installation/);
    const revoked = await db.collection('installations').findOne({ _id: 'TONE' });
    assert.equal(revoked?.active, false);
    assert.equal('botToken' in (revoked ?? {}), false);
    assert.equal(revoked?.regionId, 'retained-region');
    assert.deepEqual(revoked?.adminUserIds, ['UORIGINAL']);
    assert.equal((await store.fetchInstallation(query('TTWO'))).bot?.token, 'xoxb-second');

    await store.storeInstallation(installation('TONE', 'xoxb-returned', 'UAGAIN'));
    assert.equal((await store.fetchInstallation(query('TONE'))).bot?.token, 'xoxb-returned');
    const restored = await db.collection('installations').findOne({ _id: 'TONE' });
    assert.ok(restored);
    assert.deepEqual(restored?.adminUserIds, ['UORIGINAL']);

    const staleEventTime = Math.floor(restored.updatedAt.getTime() / 1000) - 1;
    const currentEventTime = Math.ceil(restored.updatedAt.getTime() / 1000) + 1;
    await revokeWorkspaceInstallation(db, appId, 'TONE', staleEventTime);
    await revokeBotCredentials(db, appId, 'TONE', ['UTONE'], staleEventTime);
    await revokeBotCredentials(db, appId, 'TONE', ['UOTHER'], currentEventTime);
    assert.equal((await store.fetchInstallation(query('TONE'))).bot?.token, 'xoxb-returned');
    await revokeBotCredentials(db, appId, 'TONE', ['UTONE'], currentEventTime);
    await assert.rejects(store.fetchInstallation(query('TONE')), /No active installation/);
    assert.equal((await store.fetchInstallation(query('TTWO'))).bot?.token, 'xoxb-second');
  } finally {
    await harness.close();
  }
});

test('OAuth state is persisted, expires, and can be consumed only once', async () => {
  const harness = await openIntegrationDatabase();
  try {
    const { db } = harness.connection;
    await provisionOAuthIndexes(db);
    const stateStore = createOAuthStateStore(db);
    const secondInstance = createOAuthStateStore(db);
    const now = new Date();
    const options = { scopes: [...BOT_SCOPES], metadata: 'install' };
    const state = await stateStore.generateStateParam(options, now);
    assert.match(state, /^[0-9a-f]{64}$/);
    assert.equal(
      JSON.stringify(await db.collection('oauthStates').findOne({})).includes(state),
      false,
    );
    assert.deepEqual(await secondInstance.verifyStateParam(now, state), options);
    await assert.rejects(stateStore.verifyStateParam(now, state), /Invalid or expired/);
    await assert.rejects(stateStore.verifyStateParam(now, 'invalid'), /Invalid or expired/);

    const expired = await stateStore.generateStateParam(options, now);
    await assert.rejects(
      secondInstance.verifyStateParam(new Date(now.getTime() + 10 * 60 * 1000), expired),
      /Invalid or expired/,
    );
  } finally {
    await harness.close();
  }
});

test('installation store rejects unverified app and org-wide installation', async () => {
  const harness = await openIntegrationDatabase();
  try {
    const store = createInstallationStore(harness.connection.db, appId, cipher);
    await assert.rejects(
      store.storeInstallation({ ...installation('TONE', 'xoxb-token'), appId: 'AOTHER' }),
      /unsupported or unverified/,
    );
    const excessiveScopes = installation('TONE', 'xoxb-token');
    assert.ok(excessiveScopes.bot);
    excessiveScopes.bot.scopes.push('admin');
    await assert.rejects(store.storeInstallation(excessiveScopes), /unsupported or unverified/);
    await assert.rejects(
      store.fetchInstallation({
        teamId: undefined,
        enterpriseId: 'EORG1',
        isEnterpriseInstall: true,
      }),
      /workspace team ID/,
    );
    assert.equal(await harness.connection.db.collection('installations').countDocuments({}), 0);
  } finally {
    await harness.close();
  }
});
