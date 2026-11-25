import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMessageViews,
  provisionMessageViewIndexes,
} from '../../../src/modules/entry-capture/message-views.ts';
import { createSummaryDelivery } from '../../../src/modules/entry-capture/summary-delivery.ts';
import { createEntryProvider } from '../../../src/modules/entry-ledger/entries.ts';
import { provisionEntryIndexes } from '../../../src/modules/entry-ledger/indexes.ts';
import { provisionSeasonIndexes } from '../../../src/modules/entry-ledger/season-repository.ts';
import { createSeasonProvider } from '../../../src/modules/entry-ledger/seasons.ts';
import { createSummaryOutbox } from '../../../src/modules/entry-ledger/summary-outbox.ts';
import type { ChannelClient } from '../../../src/modules/workspace-foundation/channels.ts';
import {
  createConfigurationProvider,
  provisionConfigurationIndexes,
} from '../../../src/modules/workspace-foundation/configuration.ts';
import { createWorkspaceContextProvider } from '../../../src/modules/workspace-foundation/context.ts';
import { openIntegrationDatabase } from '../database-harness.ts';

async function setup() {
  const harness = await openIntegrationDatabase();
  const { db, client } = harness.connection;
  await provisionEntryIndexes(db);
  await provisionSeasonIndexes(db);
  await provisionConfigurationIndexes(db);
  await provisionMessageViewIndexes(db);
  const slack: ChannelClient = {
    users: {
      async info({ user }) {
        return { ok: true, user: { id: user, team_id: 'TONE', deleted: false } };
      },
    },
    conversations: {
      async info({ channel }) {
        return {
          ok: true,
          channel: {
            id: channel,
            name: 'ao-test',
            context_team_id: 'TONE',
            is_channel: true,
            is_private: false,
            is_ext_shared: false,
            is_pending_ext_shared: false,
            is_shared: false,
            is_member: true,
          },
        };
      },
      async members() {
        return { ok: true, members: ['UADMIN'] };
      },
    },
  };
  await db.collection('installations').insertOne({
    _id: 'TONE',
    teamId: 'TONE',
    appId: 'AAPP',
    installerUserId: 'UADMIN',
    active: true,
    botToken: {},
  });
  const contexts = createWorkspaceContextProvider(db, client, 'AAPP');
  const context = await contexts.resolveWorkspaceContext({
    teamId: 'TONE',
    actorUserId: 'UADMIN',
    appId: 'AAPP',
  });
  const config = createConfigurationProvider(db, contexts);
  const seasons = createSeasonProvider(db, contexts);
  config.registerSetupCheck(seasons.rawSeasonReadiness);
  const suggested = config.getSuggestedSetup();
  await config.confirmInitialSetup(
    context,
    {
      ...suggested,
      regionName: 'Test',
      timezone: 'UTC',
      aos: [{ ...suggested.aos[0], name: 'Test AO', channelId: 'CAO' }],
      automaticBackblastRepliesEnabled: false,
    },
    slack,
  );
  const season = await seasons.configureSeason(
    context,
    {
      selector: 'test',
      label: 'Test',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      timezone: 'UTC',
    },
    undefined,
    'season',
    'Setup',
  );
  const entries = createEntryProvider({
    db,
    client,
    foundation: {
      assertActive: contexts.assertActive,
      fenceActive: contexts.fenceActive,
      assertConfigured: config.assertConfigured,
    },
    slack,
    now: () => new Date('2026-02-01T00:00:00Z'),
  });
  const input = {
    reference: {
      aoId: suggested.aos[0].aoId,
      localDate: '2026-01-10',
      localStartTime: '05:30',
      timezone: 'UTC',
      paxUserIds: ['UPAX'],
    },
    temperatureF: 20,
    reason: 'Manual',
  };
  const receipt = await entries.saveEntry(context, input, 0, 1, 'save');
  const views = createMessageViews(db);
  const outbox = createSummaryOutbox(db);
  const sent: { mode: string; channel: string; text: string }[] = [];
  let fail = false;
  let clock = new Date('2026-02-01T00:00:00Z');
  const delivery = createSummaryDelivery({
    views,
    outbox,
    loadState: entries.getSummaryState,
    now: () => clock,
    async authorizeDestination(_c, channel) {
      assert.equal(channel, 'CAO');
    },
    async deferSlot() {},
    async reserveSlot() {
      return 0;
    },
    async slack() {
      return {
        async post(channel, message) {
          sent.push({ mode: 'post', channel, text: message.text });
          if (fail) throw new Error('timeout');
          return { channelId: channel, messageTs: '123.456' };
        },
        async update(ref, message) {
          sent.push({ mode: 'update', channel: ref.channelId, text: message.text });
          if (fail) throw { retryAfter: 1 };
        },
      };
    },
  });
  return {
    harness,
    db,
    context,
    contexts,
    entries,
    input,
    receipt,
    views,
    outbox,
    delivery,
    sent,
    season,
    seasons,
    setFail(value: boolean) {
      fail = value;
    },
    advance() {
      clock = new Date(clock.getTime() + 60_000);
    },
  };
}

test('outbox renders latest committed state after restart without crediting twice', async () => {
  const s = await setup();
  try {
    const edit = await s.entries.saveEntry(
      s.context,
      { ...s.input, entryId: s.receipt.entryId, temperatureF: 0 },
      1,
      1,
      'edit',
    );
    assert.equal((await s.outbox.next())?.actorUserId, 'UADMIN');
    // A staged recalculation result must not become the displayed score.
    await s.db.collection('entryScoreGenerations').insertOne({
      teamId: s.context.teamId,
      regionId: s.context.regionId,
      entryId: edit.entryId,
      factVersion: 2,
      generationId: 'unpublished',
      pointsPerPax: 999,
    });
    await Promise.all([
      s.delivery.deliver(s.context, 'save'),
      s.delivery.deliver(s.context, 'edit'),
    ]);
    s.advance();
    await s.delivery.deliver(s.context, 'edit');
    assert.equal(s.sent.filter((send) => send.mode === 'post').length, 1);
    assert.ok(s.sent.every((send) => send.text.includes('5 points per PAX')));
    assert.equal((await s.views.get(s.context, edit.entryId))?.version, 2);
    assert.equal(await s.db.collection('entries').countDocuments({}), 1);
    assert.equal(await s.db.collection('entryRevisions').countDocuments({}), 2);
    assert.equal(await s.db.collection('operationReceipts').countDocuments({}), 2);
    assert.match((await s.delivery.confirmation(s.context, edit.entryId)).text, /View entry/);
    await s.delivery.deliver(s.context, 'save');
    assert.equal(s.sent.filter((send) => send.mode === 'post').length, 1);
    const next = await s.outbox.next();
    assert.equal(next, null);
  } finally {
    await s.harness.close();
  }
});

test('inline updates retry known failures and render locked/archive-compatible current state', async () => {
  const s = await setup();
  try {
    await s.views.registerInline(s.context, s.receipt.entryId, {
      channelId: 'CAO',
      messageTs: '100.200',
    });
    await s.seasons.setSeasonLock(s.context, s.season.seasonId, true, 1, 'lock', 'Final');
    s.setFail(true);
    await s.delivery.deliver(s.context, 'save');
    assert.equal((await s.views.get(s.context, s.receipt.entryId))?.status, 'idle');
    s.setFail(false);
    s.advance();
    await s.delivery.deliver(s.context, 'save');
    assert.ok(
      s.sent.every((send) => send.mode === 'update' && send.text.includes('Season locked')),
    );
    assert.equal(s.sent.filter((send) => send.mode === 'post').length, 0);
    assert.equal(await s.db.collection('entries').countDocuments({}), 1);
    assert.equal(await s.db.collection('entryRevisions').countDocuments({}), 1);
    await s.db
      .collection('entries')
      .updateOne({ entryId: s.receipt.entryId }, { $set: { status: 'archived' } });
    assert.equal(
      (await s.entries.getSummaryState(s.context, s.receipt.entryId)).entry.status,
      'archived',
    );
    const previous = await s.db.collection('messageOutbox').findOne({ operationKey: 'save' });
    assert.ok(previous);
    const { _id: _ignored, ...refresh } = previous;
    await s.db
      .collection('messageOutbox')
      .insertOne({ ...refresh, operationKey: 'archive-refresh', status: 'pending' });
    await s.delivery.deliver(s.context, 'archive-refresh');
    assert.match(s.sent.at(-1)?.text ?? '', /Archived/);
  } finally {
    await s.harness.close();
  }
});

test('uncertain post outcomes survive restart and tenant mismatches cannot claim jobs or views', async () => {
  const s = await setup();
  try {
    s.setFail(true);
    await s.delivery.deliver(s.context, 'save');
    assert.equal((await s.views.get(s.context, s.receipt.entryId))?.status, 'uncertain');
    s.advance();
    await s.delivery.deliver(s.context, 'save');
    assert.equal(s.sent.length, 1);
    assert.match(
      (await s.delivery.confirmation(s.context, s.receipt.entryId)).text,
      /Saved; message update pending/,
    );
    await s.db.collection('installations').insertOne({
      _id: 'TTWO',
      teamId: 'TTWO',
      appId: 'AAPP',
      installerUserId: 'UADMIN',
      active: true,
      botToken: {},
    });
    const other = await s.contexts.resolveWorkspaceContext({
      teamId: 'TTWO',
      actorUserId: 'UADMIN',
      appId: 'AAPP',
    });
    assert.equal(await s.outbox.claim(other, 'save'), null);
    assert.equal(await s.views.get(other, s.receipt.entryId), null);
    assert.equal(await s.db.collection('entryRevisions').countDocuments({}), 1);
  } finally {
    await s.harness.close();
  }
});

test('expired local leases recover, while expired remote sends remain uncertain', async () => {
  const s = await setup();
  try {
    const now = new Date();
    const leased = await s.outbox.claim(s.context, 'save', now);
    assert.ok(leased);
    assert.equal(await s.outbox.claim(s.context, 'save', now), null);
    const reclaimed = await s.outbox.claim(s.context, 'save', new Date(now.getTime() + 31_000));
    assert.ok(reclaimed);
    assert.notEqual(reclaimed.leaseId, leased.leaseId);
    assert.equal(reclaimed.attempts, 2);
    const first = await s.views.claim(s.context, s.receipt.entryId, now);
    assert.ok(first);
    const second = await s.views.claim(
      s.context,
      s.receipt.entryId,
      new Date(now.getTime() + 31_000),
    );
    assert.ok(second);
    assert.equal(await s.views.markSending(s.context, first, now), false);
    assert.equal(
      await s.views.markSending(s.context, second, new Date(now.getTime() + 31_000)),
      true,
    );
    assert.equal(
      await s.views.claim(s.context, s.receipt.entryId, new Date(now.getTime() + 62_000)),
      null,
    );
    assert.equal((await s.views.get(s.context, s.receipt.entryId))?.status, 'uncertain');
    await s.outbox.finish(s.context, { ...reclaimed, attempts: 5 }, 'pending');
    assert.equal(await s.outbox.claim(s.context, 'save', new Date(now.getTime() + 90_000)), null);
  } finally {
    await s.harness.close();
  }
});

test('runtime uses tenant installation credentials and validates the selected public AO before posting', async () => {
  const s = await setup();
  try {
    const [
      { createSummaryRuntime },
      { createOperationRepository },
      { createInstallationStore, BOT_SCOPES },
      { createTokenCipher },
    ] = await Promise.all([
      import('../../../src/modules/entry-capture/summary-runtime.ts'),
      import('../../../src/modules/workspace-foundation/operations.ts'),
      import('../../../src/modules/workspace-foundation/installations.ts'),
      import('../../../src/modules/workspace-foundation/token-crypto.ts'),
    ]);
    const installations = createInstallationStore(
      s.db,
      'AAPP',
      createTokenCipher(
        JSON.stringify({ current: 'v1', keys: { v1: Buffer.alloc(32, 7).toString('base64') } }),
      ),
    );
    await s.db
      .collection('installations')
      .updateOne({ _id: 'TONE' }, { $set: { schemaVersion: 1, createdAt: new Date() } });
    await installations.storeInstallation({
      team: { id: 'TONE' },
      user: { id: 'UADMIN' },
      bot: { id: 'BBOT', userId: 'UBOT', token: 'xoxb-test-only', scopes: [...BOT_SCOPES] },
      appId: 'AAPP',
      isEnterpriseInstall: false,
      authVersion: 'v2',
    });
    let posted = 0;
    const app = {
      logger: { error() {} },
      client: {
        users: {
          async info(args: { user: string; token: string }) {
            assert.equal(args.token, 'xoxb-test-only');
            return { ok: true, user: { id: args.user, team_id: 'TONE', deleted: false } };
          },
        },
        conversations: {
          async info(args: { channel: string; token: string }) {
            assert.equal(args.token, 'xoxb-test-only');
            assert.equal(args.channel, 'CAO');
            return {
              ok: true,
              channel: {
                id: 'CAO',
                name: 'ao-test',
                context_team_id: 'TONE',
                is_channel: true,
                is_private: false,
                is_ext_shared: false,
                is_pending_ext_shared: false,
                is_shared: false,
                is_member: true,
              },
            };
          },
          async members() {
            return { ok: true, members: ['UADMIN'] };
          },
        },
        chat: {
          async postMessage(args: { channel: string; token: string; text: string }) {
            assert.equal(args.token, 'xoxb-test-only');
            assert.equal(args.channel, 'CAO');
            assert.match(args.text, /2 points per PAX/);
            posted++;
            return { ok: true, channel: 'CAO', ts: '123.456' };
          },
        },
      },
    };
    const runtime = createSummaryRuntime({
      db: s.db,
      app: app as never,
      appId: 'AAPP',
      contexts: s.contexts,
      installations,
      operations: createOperationRepository(s.db, s.contexts.assertActive),
      entries: s.entries,
    });
    await runtime.runOnce();
    await runtime.runOnce();
    assert.equal(posted, 1);
    assert.match(
      (await runtime.delivery.confirmation(s.context, s.receipt.entryId)).text,
      /View entry/,
    );
  } finally {
    await s.harness.close();
  }
});
