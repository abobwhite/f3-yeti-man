import assert from 'node:assert/strict';
import test from 'node:test';
import { fenceOpenSeasons } from '../../../src/modules/entry-ledger/season-fence.ts';
import {
  createSeasonRepository,
  provisionSeasonIndexes,
} from '../../../src/modules/entry-ledger/season-repository.ts';
import {
  createSeasonProvider,
  suggestWinterSeason,
} from '../../../src/modules/entry-ledger/seasons.ts';
import { createWorkspaceContextProvider } from '../../../src/modules/workspace-foundation/context.ts';
import { openIntegrationDatabase } from '../database-harness.ts';

async function setup() {
  const harness = await openIntegrationDatabase();
  const { db, client } = harness.connection;
  await provisionSeasonIndexes(db);
  await db.collection('installations').insertOne({
    _id: 'TONE',
    teamId: 'TONE',
    appId: 'AAPP1',
    installerUserId: 'UADMIN',
    active: true,
    botToken: {},
  });
  const admin = createWorkspaceContextProvider(db, client, 'AAPP1');
  const context = await admin.resolveWorkspaceContext({
    teamId: 'TONE',
    actorUserId: 'UADMIN',
    appId: 'AAPP1',
  });
  return {
    harness,
    db,
    client,
    admin,
    context,
    provider: createSeasonProvider(db, admin),
    repository: createSeasonRepository(db),
  };
}

test('explicit seasons support leap, same-year and inclusive boundary dates', async () => {
  const state = await setup();
  try {
    const { provider, context } = state;
    const suggestion = suggestWinterSeason(2023, 'America/Chicago');
    assert.equal(suggestion.endDate, '2024-02-29');
    const winter = await provider.configureSeason(
      context,
      suggestion,
      undefined,
      'winter',
      'Initial season',
    );
    assert.equal(winter.version, 1);
    assert.equal(
      (await provider.findSeasonByDate(context, '2023-12-01'))?.seasonId,
      winter.seasonId,
    );
    assert.equal(
      (await provider.findSeasonByDate(context, '2024-02-29'))?.seasonId,
      winter.seasonId,
    );
    assert.equal(await provider.findSeasonByDate(context, '2024-03-01'), null);
    assert.equal(await provider.rawSeasonReadiness(context), true);
    const testDay = await provider.configureSeason(
      context,
      {
        selector: 'test-may',
        label: 'Test May',
        startDate: '2024-05-01',
        endDate: '2024-05-01',
        timezone: 'America/Chicago',
      },
      undefined,
      'may',
      'Testing',
    );
    assert.equal(
      (await provider.findSeasonByDate(context, '2024-05-01'))?.seasonId,
      testDay.seasonId,
    );
    assert.equal(
      (await provider.configureSeason(context, suggestion, undefined, 'winter', 'Initial season'))
        .seasonId,
      winter.seasonId,
    );
    await assert.rejects(
      provider.configureSeason(
        context,
        { ...suggestion, selector: 'bad', startDate: '2024-02-29' },
        undefined,
        'overlap',
        'Testing',
      ),
      /SEASON_OVERLAP/,
    );
    assert.throws(() =>
      provider.configureSeason(
        context,
        { ...suggestion, selector: 'invalid', startDate: '2023-02-29' },
        undefined,
        'bad-date',
        'Testing',
      ),
    );
    assert.throws(
      () =>
        provider.configureSeason(
          context,
          { ...suggestion, selector: 'zone', timezone: 'Fake/Zone' },
          undefined,
          'bad-zone',
          'Testing',
        ),
      /IANA timezone/,
    );
    assert.equal(
      await state.db.collection('seasonAudit').countDocuments({ seasonId: winter.seasonId }),
      1,
    );
  } finally {
    await state.harness.close();
  }
});

test('concurrent overlapping creates contend on the catalog fence', async () => {
  const state = await setup();
  try {
    const { provider, context } = state;
    const input = {
      selector: 'one',
      label: 'One',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
      timezone: 'UTC',
    };
    const outcomes = await Promise.allSettled([
      provider.configureSeason(context, input, undefined, 'one', 'Create'),
      provider.configureSeason(
        context,
        { ...input, selector: 'two', startDate: '2025-01-31', endDate: '2025-02-28' },
        undefined,
        'two',
        'Create',
      ),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    assert.equal((await provider.listSeasons(context)).length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected').length, 1);
  } finally {
    await state.harness.close();
  }
});

test('date edits preserve retained archived references and lock transitions fence writes', async () => {
  const state = await setup();
  try {
    const { provider, context, db, client, repository } = state;
    const season = await provider.configureSeason(
      context,
      {
        selector: 'summer',
        label: 'Summer',
        startDate: '2025-06-01',
        endDate: '2025-06-30',
        timezone: 'UTC',
      },
      undefined,
      'create',
      'Create',
    );
    await db.collection('entries').insertOne({
      teamId: context.teamId,
      regionId: context.regionId,
      seasonId: season.seasonId,
      entryId: 'retained',
      status: 'archived',
      workoutReference: { localDate: '2025-06-01' },
    });
    await db.collection('entries').insertOne({
      teamId: context.teamId,
      regionId: context.regionId,
      seasonId: season.seasonId,
      entryId: 'active',
      status: 'active',
      workoutReference: { localDate: '2025-06-02' },
    });
    await db.collection('entryDrafts').insertOne({
      teamId: context.teamId,
      regionId: context.regionId,
      seasonId: season.seasonId,
      status: 'pending',
    });
    const preview = await provider.getSeasonLockPreview(context, season.seasonId);
    assert.deepEqual(
      { activeEntries: preview.activeEntries, pendingDrafts: preview.pendingDrafts },
      { activeEntries: 1, pendingDrafts: 1 },
    );
    await assert.rejects(
      provider.configureSeason(
        context,
        {
          selector: 'summer',
          label: 'Summer',
          startDate: '2025-06-02',
          endDate: '2025-06-30',
          timezone: 'UTC',
        },
        1,
        'shrink',
        'Adjust',
        season.seasonId,
      ),
      /SEASON_RETAINED_ENTRIES:retained/,
    );
    await assert.rejects(
      provider.setSeasonLock(context, season.seasonId, true, 0, 'stale', 'Lock'),
      /VERSION_CONFLICT/,
    );
    const locked = await provider.setSeasonLock(context, season.seasonId, true, 1, 'lock', 'Close');
    assert.equal(locked.locked, true);
    assert.equal(
      (
        await provider.configureSeason(
          context,
          {
            selector: 'summer',
            label: 'Summer',
            startDate: '2025-06-01',
            endDate: '2025-06-30',
            timezone: 'UTC',
          },
          undefined,
          'create',
          'Create',
        )
      ).version,
      1,
    );
    const session = client.startSession();
    try {
      await assert.rejects(
        session.withTransaction(() =>
          fenceOpenSeasons(repository, context, [season.seasonId], session, async () => {}),
        ),
        /SEASON_LOCKED_OR_MISSING/,
      );
    } finally {
      await session.endSession();
    }
    await assert.rejects(
      provider.configureSeason(
        context,
        {
          selector: 'summer',
          label: 'Summer',
          startDate: '2025-05-01',
          endDate: '2025-06-30',
          timezone: 'UTC',
        },
        2,
        'locked-edit',
        'Adjust',
        season.seasonId,
      ),
      /SEASON_LOCKED/,
    );
    const open = await provider.setSeasonLock(
      context,
      season.seasonId,
      false,
      2,
      'unlock',
      'Reopen',
    );
    assert.equal(open.locked, false);
    assert.equal(open.version, 3);
    assert.equal(
      await db.collection('seasonAudit').countDocuments({ seasonId: season.seasonId }),
      3,
    );
  } finally {
    await state.harness.close();
  }
});

test('cross-season fences use deterministic order and a committed lock blocks later mutations', async () => {
  const state = await setup();
  try {
    const { provider, context, client, repository, db } = state;
    const first = await provider.configureSeason(
      context,
      {
        selector: 'a',
        label: 'A',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        timezone: 'UTC',
      },
      undefined,
      'a',
      'Create',
    );
    const second = await provider.configureSeason(
      context,
      {
        selector: 'b',
        label: 'B',
        startDate: '2025-02-01',
        endDate: '2025-02-28',
        timezone: 'UTC',
      },
      undefined,
      'b',
      'Create',
    );
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await fenceOpenSeasons(
          repository,
          context,
          [second.seasonId, first.seasonId, first.seasonId],
          session,
          async () => {},
        );
        await db.collection('entries').insertOne(
          {
            teamId: context.teamId,
            regionId: context.regionId,
            seasonId: second.seasonId,
            entryId: 'moved',
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    assert.equal(
      (await repository.get(context.teamId, context.regionId, first.seasonId))?.mutationFence,
      2,
    );
    assert.equal(
      (await repository.get(context.teamId, context.regionId, second.seasonId))?.mutationFence,
      2,
    );
    await provider.setSeasonLock(context, first.seasonId, true, 1, 'lock-a', 'Close');
    const denied = client.startSession();
    try {
      await assert.rejects(
        denied.withTransaction(() =>
          fenceOpenSeasons(
            repository,
            context,
            [second.seasonId, first.seasonId],
            denied,
            async () => {},
          ),
        ),
        /SEASON_LOCKED_OR_MISSING/,
      );
    } finally {
      await denied.endSession();
    }
    assert.equal(
      (await repository.get(context.teamId, context.regionId, second.seasonId))?.mutationFence,
      2,
    );
  } finally {
    await state.harness.close();
  }
});

test('a concurrent lock and save cannot both commit out of order', async () => {
  const state = await setup();
  try {
    const { provider, context, client, repository, db } = state;
    const season = await provider.configureSeason(
      context,
      {
        selector: 'race',
        label: 'Race',
        startDate: '2025-07-01',
        endDate: '2025-07-31',
        timezone: 'UTC',
      },
      undefined,
      'race-create',
      'Create',
    );
    const save = async () => {
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          await fenceOpenSeasons(repository, context, [season.seasonId], session, async () => {});
          await db.collection('entries').insertOne(
            {
              teamId: context.teamId,
              regionId: context.regionId,
              seasonId: season.seasonId,
              entryId: 'raced-save',
            },
            { session },
          );
        });
      } finally {
        await session.endSession();
      }
    };
    const outcomes = await Promise.allSettled([
      provider.setSeasonLock(context, season.seasonId, true, 1, 'race-lock', 'Close'),
      save(),
    ]);
    assert.equal(outcomes[0]?.status, 'fulfilled');
    const saved = await db.collection('entries').countDocuments({ entryId: 'raced-save' });
    assert.equal(saved, outcomes[1]?.status === 'fulfilled' ? 1 : 0);
    assert.equal(
      (await repository.get(context.teamId, context.regionId, season.seasonId))?.locked,
      true,
    );
    await assert.rejects(save(), /SEASON_LOCKED_OR_MISSING/);
  } finally {
    await state.harness.close();
  }
});
