import assert from 'node:assert/strict';
import test from 'node:test';
import { createEntryProvider } from '../../../src/modules/entry-ledger/entries.ts';
import { provisionEntryIndexes } from '../../../src/modules/entry-ledger/indexes.ts';
import { provisionSeasonIndexes } from '../../../src/modules/entry-ledger/season-repository.ts';
import { createSeasonProvider } from '../../../src/modules/entry-ledger/seasons.ts';
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
  const slack: ChannelClient = {
    users: {
      async info({ user }) {
        return {
          ok: true,
          user: {
            id: user,
            team_id: 'TONE',
            deleted: user === 'UINVALID',
            is_bot: false,
            is_app_user: false,
          },
        };
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
        return { ok: true, members: ['UADMIN', 'UOTHER'] };
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
  const aoId = suggested.aos[0].aoId;
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
      selector: 'one',
      label: 'One',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      timezone: 'UTC',
    },
    undefined,
    'season-one',
    'Setup',
  );
  const second = await seasons.configureSeason(
    context,
    {
      selector: 'two',
      label: 'Two',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      timezone: 'UTC',
    },
    undefined,
    'season-two',
    'Setup',
  );
  const foundation = {
    assertActive: contexts.assertActive,
    fenceActive: contexts.fenceActive,
    assertConfigured: config.assertConfigured,
  };
  const provider = createEntryProvider({
    db,
    client,
    foundation,
    slack,
    now: () => new Date('2026-03-01T00:00:00Z'),
  });
  const input = {
    reference: {
      aoId,
      localDate: '2026-01-10',
      localStartTime: '05:30',
      timezone: 'UTC',
      paxUserIds: ['UPAX', 'UPAX'],
    },
    temperatureF: '20',
    reason: 'Initial entry',
  };
  return {
    harness,
    db,
    client,
    context,
    contexts,
    config,
    foundation,
    slack,
    provider,
    input,
    season,
    second,
    seasons,
  };
}

test('atomic saves converge, bind retries and preserve authoritative history on Modify', async () => {
  const s = await setup();
  try {
    const { provider: p, context: c, input } = s;
    const results = await Promise.all([
      p.saveEntry(c, input, 0, 1, 'one'),
      p.saveEntry(
        c,
        { ...input, reference: { ...input.reference, paxUserIds: ['UOTHER'] } },
        0,
        1,
        'two',
      ),
    ]);
    assert.equal(results[0].entryId, results[1].entryId);
    assert.equal(results.filter((r) => r.outcome === 'saved').length, 1);
    const saved = results.find((r) => r.outcome === 'saved')!;
    const entry = await p.getEntry(c, saved.entryId);
    assert.equal(entry.version, 1);
    assert.equal(entry.pointsPerPax, 2);
    assert.equal(entry.paxUserIds.length, 1);
    assert.equal(await s.db.collection('entryRevisions').countDocuments({}), 1);
    assert.equal(await s.db.collection('entryScoreGenerations').countDocuments({}), 1);
    assert.equal(await s.db.collection('messageOutbox').countDocuments({}), 1);
    const originalInput =
      saved.operationKey === 'one'
        ? input
        : { ...input, reference: { ...input.reference, paxUserIds: ['UOTHER'] } };
    assert.deepEqual(await p.saveEntry(c, originalInput, 0, 1, saved.operationKey), saved);
    await assert.rejects(
      p.saveEntry(c, { ...originalInput, temperatureF: 10 }, 0, 1, saved.operationKey),
      /OPERATION_KEY_CONFLICT/,
    );
    const other = await s.contexts.resolveWorkspaceContext({
      teamId: 'TONE',
      actorUserId: 'UOTHER',
      appId: 'AAPP',
    });
    await assert.rejects(
      p.saveEntry(other, originalInput, 0, 1, saved.operationKey),
      /OPERATION_KEY_CONFLICT/,
    );
    await s.db
      .collection('entries')
      .updateOne({ entryId: saved.entryId }, { $set: { sourceQUserIds: ['UQ'] } });
    const edit = {
      ...input,
      entryId: saved.entryId,
      temperatureF: 0,
      reference: { ...input.reference, paxUserIds: ['UOTHER'] },
      reason: 'Correct temperature and roster',
    };
    await p.saveEntry(other, edit, 1, 1, 'edit');
    const updated = await p.getEntry(c, saved.entryId);
    assert.deepEqual(updated.paxUserIds, ['UOTHER']);
    assert.deepEqual(updated.sourceQUserIds, ['UQ']);
    assert.equal(updated.createdBy, 'UADMIN');
    assert.equal(updated.updatedBy, 'UOTHER');
    assert.equal(updated.pointsPerPax, 5);
    await assert.rejects(p.saveEntry(c, edit, 1, 1, 'stale'), /VERSION_CONFLICT/);
    assert.equal((await p.findByWorkoutReference(c, input.reference))?.entryId, saved.entryId);
    await assert.rejects(p.getEntry(c, crypto.randomUUID()), /NOT_FOUND_OR_FORBIDDEN/);
    await assert.rejects(p.saveEntry(c, input, 0, 2, 'config'), /CONFIGURATION_REVISION_CONFLICT/);
  } finally {
    await s.harness.close();
  }
});

test('source identity, archived identity, moves, locks and rollback cannot duplicate credit', async () => {
  const s = await setup();
  try {
    const { provider: p, context: c, input } = s;
    const source = {
      channelId: 'CAO',
      messageTs: '123.456',
      role: 'backblast' as const,
      qUserIds: ['UQ'],
    };
    const saved = await p.saveEntry(c, { ...input, source }, 0, 1, 'source');
    const move = {
      ...input,
      entryId: saved.entryId,
      reference: { ...input.reference, localDate: '2026-02-10' },
    };
    await p.saveEntry(c, move, 1, 1, 'move');
    assert.equal((await p.findBySource(c, source))?.entryId, saved.entryId);
    assert.deepEqual((await p.getEntry(c, saved.entryId)).sourceQUserIds, ['UQ']);
    const replay = await p.saveEntry(c, { ...input, source }, 0, 1, 'repost');
    assert.equal(replay.outcome, 'duplicate');
    assert.equal(replay.entryId, saved.entryId);
    assert.equal((await p.getEntry(c, saved.entryId)).seasonId, s.second.seasonId);
    const another = await p.saveEntry(c, input, 0, 1, 'another');
    await assert.rejects(
      p.saveEntry(c, { ...input, entryId: saved.entryId }, 2, 1, 'collision'),
      /ENTRY_REFERENCE_CONFLICT/,
    );
    await s.seasons.setSeasonLock(c, s.second.seasonId, true, 1, 'lock', 'Final');
    await assert.rejects(
      p.saveEntry(
        c,
        {
          ...input,
          entryId: saved.entryId,
          reference: { ...input.reference, localDate: '2026-01-11' },
        },
        2,
        1,
        'locked-move',
      ),
      /SEASON_LOCKED/,
    );
    await s.db
      .collection('entries')
      .updateOne({ entryId: another.entryId }, { $set: { status: 'archived' } });
    assert.equal((await p.findByWorkoutReference(c, input.reference))?.status, 'archived');
    assert.equal(
      (await p.saveEntry(c, input, 0, 1, 'archived-duplicate')).entryId,
      another.entryId,
    );
    await assert.rejects(
      p.saveEntry(c, { ...input, entryId: another.entryId }, 1, 1, 'archived-edit'),
      /ENTRY_ARCHIVED/,
    );
    // Fail after facts/revision/projection writes by forcing an outbox uniqueness violation.
    await s.db
      .collection('messageOutbox')
      .insertOne({ teamId: c.teamId, regionId: c.regionId, operationKey: 'rollback' });
    await assert.rejects(
      p.saveEntry(
        c,
        { ...input, reference: { ...input.reference, localDate: '2026-01-12' } },
        0,
        1,
        'rollback',
      ),
    );
    assert.equal(
      await p.findByWorkoutReference(c, { ...input.reference, localDate: '2026-01-12' }),
      null,
    );
    assert.equal(
      await s.db.collection('operationReceipts').countDocuments({ operationKey: 'rollback' }),
      0,
    );
    assert.equal(
      await s.db.collection('entryRevisions').countDocuments({ operationKey: 'rollback' }),
      0,
    );
    assert.equal(await s.db.collection('entryScoreGenerations').countDocuments({}), 3);
  } finally {
    await s.harness.close();
  }
});

test('invalid facts and cross-tenant lookups are rejected', async () => {
  const s = await setup();
  try {
    const { provider: p, context: c, input } = s;
    for (const reference of [
      { ...input.reference, aoId: crypto.randomUUID() },
      { ...input.reference, paxUserIds: ['UINVALID'] },
      { ...input.reference, localDate: '2027-01-01' },
      { ...input.reference, localDate: '2026-03-02' },
      { ...input.reference, localDate: '2026-01-32' },
      { ...input.reference, timezone: 'America/Chicago' },
    ])
      await assert.rejects(p.saveEntry(c, { ...input, reference }, 0, 1, crypto.randomUUID()));
    await assert.rejects(p.saveEntry(c, { ...input, temperatureF: '20F' }, 0, 1, 'temperature'));
    const saved = await p.saveEntry(c, input, 0, 1, 'save');
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
    const otherProvider = createEntryProvider({
      db: s.db,
      client: s.client,
      foundation: s.foundation,
      slack: {
        ...s.slack,
        users: {
          async info({ user }) {
            return { ok: true, user: { id: user, team_id: 'TTWO', deleted: false } };
          },
        },
      },
    });
    await assert.rejects(otherProvider.getEntry(other, saved.entryId), /NOT_FOUND_OR_FORBIDDEN/);
    assert.equal(await otherProvider.findByWorkoutReference(other, input.reference), null);
    assert.equal(await s.db.collection('entries').countDocuments({}), 1);
  } finally {
    await s.harness.close();
  }
});

test('configuration and season locks serialize against entry commits', async () => {
  const s = await setup();
  try {
    const saved = await s.provider.saveEntry(s.context, s.input, 0, 1, 'original');
    const outcomes = await Promise.allSettled([
      s.provider.saveEntry(
        s.context,
        { ...s.input, entryId: saved.entryId, temperatureF: 0 },
        1,
        1,
        'racing-save',
      ),
      s.seasons.setSeasonLock(s.context, s.season.seasonId, true, 1, 'racing-lock', 'Final'),
    ]);
    assert.equal(outcomes[1].status, 'fulfilled');
    const entry = await s.provider.getEntry(s.context, saved.entryId);
    assert.equal(entry.version, outcomes[0].status === 'fulfilled' ? 2 : 1);
    await assert.rejects(
      s.provider.saveEntry(
        s.context,
        { ...s.input, entryId: saved.entryId },
        entry.version,
        1,
        'after-lock',
      ),
      /SEASON_LOCKED/,
    );
    // A committed retry remains a receipt even after settings change and the season locks.
    await s.db
      .collection('regionConfigurations')
      .updateOne({ teamId: s.context.teamId }, { $inc: { revision: 1 } });
    assert.deepEqual(await s.provider.saveEntry(s.context, s.input, 0, 1, 'original'), saved);

    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let first = true;
    const provider = createEntryProvider({
      db: s.db,
      client: s.client,
      slack: s.slack,
      now: () => new Date('2026-03-01T00:00:00Z'),
      foundation: {
        ...s.foundation,
        async assertConfigured(context, revision, session) {
          if (session && first) {
            first = false;
            reached();
            await gate;
          }
          return s.config.assertConfigured(context, revision, session);
        },
      },
    });
    const pending = provider.saveEntry(
      s.context,
      { ...s.input, reference: { ...s.input.reference, localDate: '2026-02-12' } },
      0,
      2,
      'config-race',
    );
    await paused;
    await s.db
      .collection('regionConfigurations')
      .updateOne({ teamId: s.context.teamId }, { $inc: { revision: 1, fence: 1 } });
    release();
    await assert.rejects(pending, /CONFIGURATION_REVISION_CONFLICT/);
    assert.equal(
      await s.db.collection('operationReceipts').countDocuments({ operationKey: 'config-race' }),
      0,
    );
    assert.equal(await s.db.collection('entries').countDocuments({}), 1);
  } finally {
    await s.harness.close();
  }
});
