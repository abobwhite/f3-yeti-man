import assert from 'node:assert/strict';
import test from 'node:test';
import { provisionSeasonIndexes } from '../../../src/modules/entry-ledger/season-repository.ts';
import { createSeasonProvider } from '../../../src/modules/entry-ledger/seasons.ts';
import type { ChannelClient } from '../../../src/modules/workspace-foundation/channels.ts';
import {
  createConfigurationProvider,
  provisionConfigurationIndexes,
} from '../../../src/modules/workspace-foundation/configuration.ts';
import { createWorkspaceContextProvider } from '../../../src/modules/workspace-foundation/context.ts';
import { setupRequiredMessage } from '../../../src/modules/workspace-foundation/setup-status.ts';
import { openIntegrationDatabase } from '../database-harness.ts';

const slack: ChannelClient = {
  users: {
    async info({ user }) {
      return {
        ok: true,
        user: {
          id: user,
          team_id: 'TONE',
          deleted: false,
          is_bot: user === 'UF3BOT',
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
          is_org_shared: false,
          is_member: true,
          is_archived: false,
        },
      };
    },
    async members() {
      return { ok: true, members: ['UADMIN'] };
    },
  },
};

async function setup() {
  const harness = await openIntegrationDatabase();
  const { db, client } = harness.connection;
  await provisionSeasonIndexes(db);
  await provisionConfigurationIndexes(db);
  await db.collection('installations').insertOne({
    _id: 'TONE',
    teamId: 'TONE',
    appId: 'AAPP1',
    installerUserId: 'UADMIN',
    active: true,
    botToken: {},
  });
  const boundary = createWorkspaceContextProvider(db, client, 'AAPP1');
  const admin = await boundary.resolveWorkspaceContext({
    teamId: 'TONE',
    actorUserId: 'UADMIN',
    appId: 'AAPP1',
  });
  const configuration = createConfigurationProvider(db, boundary);
  const seasons = createSeasonProvider(db, boundary);
  configuration.registerSetupCheck(seasons.rawSeasonReadiness);
  return { harness, db, boundary, admin, configuration, seasons };
}

test('defaults remain inactive until admin confirms all settings and a season', async () => {
  const state = await setup();
  try {
    const { configuration, seasons, admin } = state;
    const suggested = configuration.getSuggestedSetup();
    assert.equal((await configuration.getSetupStatus(admin)).ready, false);
    assert.match(
      setupRequiredMessage(await configuration.getSetupStatus(admin)),
      /Competition start\/end dates/,
    );
    const input = {
      ...suggested,
      regionName: 'Test Region',
      timezone: 'America/Chicago',
      aos: [{ ...suggested.aos[0], name: 'Test AO', channelId: 'CTEST1' }],
      automaticBackblastRepliesEnabled: false,
    };
    const saved = await configuration.confirmInitialSetup(admin, input, slack);
    assert.equal(saved.revision, 1);
    assert.equal((await configuration.getSetupStatus(admin)).ready, false);
    await seasons.configureSeason(
      admin,
      {
        selector: 'test',
        label: 'Test',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        timezone: 'America/Chicago',
      },
      undefined,
      'initial',
      'Initial setup',
    );
    assert.equal((await configuration.getSetupStatus(admin)).ready, true);
    await assert.rejects(
      configuration.confirmInitialSetup(admin, input, slack, 1),
      /INITIAL_SETUP_ALREADY_CONFIRMED/,
    );
    await assert.doesNotReject(configuration.assertConfigured(admin, 1));
    await assert.rejects(
      configuration.assertConfigured(admin, 2),
      /CONFIGURATION_REVISION_CONFLICT/,
    );
    await state.harness.connection.client.withSession(async (session) =>
      session.withTransaction(async () => {
        await configuration.assertConfigured(admin, 1, session);
      }),
    );
  } finally {
    await state.harness.close();
  }
});

test('ON requires verified bot, OFF does not; stale and non-admin saves fail', async () => {
  const state = await setup();
  try {
    const { configuration, admin, boundary } = state;
    const suggested = configuration.getSuggestedSetup();
    const base = {
      ...suggested,
      regionName: 'Test',
      aos: [{ ...suggested.aos[0], name: 'AO', channelId: 'CTEST1' }],
    };
    await assert.rejects(
      configuration.confirmInitialSetup(admin, { ...base, timezone: 'Not/A_Zone' }, slack),
      /REGION_TIMEZONE_INVALID/,
    );
    await assert.rejects(
      configuration.confirmInitialSetup(admin, { ...base, aos: [base.aos[0], base.aos[0]] }, slack),
      /DUPLICATE_AO_OR_CHANNEL/,
    );
    await assert.rejects(
      configuration.confirmInitialSetup(
        admin,
        { ...base, aos: [{ ...base.aos[0], schedule: {} }] },
        slack,
      ),
      /AO_SCHEDULE_REQUIRED/,
    );
    await assert.rejects(
      configuration.confirmInitialSetup(admin, base, slack),
      /TRUSTED_F3_BOT_REQUIRED/,
    );
    await assert.rejects(
      configuration.confirmInitialSetup(admin, { ...base, trustedF3BotUserId: 'UHUMAN' }, slack),
      /TRUSTED_F3_BOT_INVALID/,
    );
    await configuration.confirmInitialSetup(
      admin,
      { ...base, trustedF3BotUserId: 'UF3BOT' },
      slack,
    );
    await assert.rejects(
      configuration.confirmInitialSetup(
        admin,
        { ...base, automaticBackblastRepliesEnabled: false },
        slack,
      ),
      /CONFIGURATION_REVISION_CONFLICT/,
    );
    const other = await boundary.resolveWorkspaceContext({
      teamId: 'TONE',
      actorUserId: 'UOTHER',
      appId: 'AAPP1',
    });
    await assert.rejects(
      configuration.confirmInitialSetup(
        other,
        { ...base, automaticBackblastRepliesEnabled: false },
        slack,
        1,
      ),
      /NOT_FOUND_OR_FORBIDDEN/,
    );
  } finally {
    await state.harness.close();
  }
});
