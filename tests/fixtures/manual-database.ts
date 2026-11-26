import {
  createDraftRepository,
  provisionDraftIndexes,
} from '../../src/modules/entry-capture/drafts.ts';
import { createManualCapture } from '../../src/modules/entry-capture/manual-command.ts';
import { createEntryProvider } from '../../src/modules/entry-ledger/entries.ts';
import { provisionEntryIndexes } from '../../src/modules/entry-ledger/indexes.ts';
import { provisionSeasonIndexes } from '../../src/modules/entry-ledger/season-repository.ts';
import { createSeasonProvider } from '../../src/modules/entry-ledger/seasons.ts';
import type { ChannelClient } from '../../src/modules/workspace-foundation/channels.ts';
import {
  createConfigurationProvider,
  provisionConfigurationIndexes,
} from '../../src/modules/workspace-foundation/configuration.ts';
import { createWorkspaceContextProvider } from '../../src/modules/workspace-foundation/context.ts';
import {
  createOperationRepository,
  provisionOperationIndexes,
} from '../../src/modules/workspace-foundation/operations.ts';
import { openIntegrationDatabase } from '../integration/database-harness.ts';
import { manualFixture } from './manual-entry.ts';

export async function manualDatabase(configured = true) {
  const f = manualFixture();
  const harness = await openIntegrationDatabase();
  const { db, client } = harness.connection;
  await provisionEntryIndexes(db);
  await provisionSeasonIndexes(db);
  await provisionConfigurationIndexes(db);
  await provisionDraftIndexes(db);
  await provisionOperationIndexes(db);
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
  const other = await contexts.resolveWorkspaceContext({
    teamId: 'TONE',
    actorUserId: 'UOTHER',
    appId: 'AAPP',
  });
  const slack: ChannelClient = {
    users: {
      async info({ user }) {
        return {
          ok: true,
          user: {
            id: user,
            team_id: user === 'UFOREIGN' ? 'TTWO' : 'TONE',
            deleted: user === 'UINACTIVE',
            is_bot: user === 'UBOT',
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
  const configuration = createConfigurationProvider(db, contexts, () => f.now);
  const seasons = createSeasonProvider(db, contexts, () => f.now);
  configuration.registerSetupCheck(seasons.rawSeasonReadiness);
  let seasonId = '';
  if (configured) {
    await configuration.confirmInitialSetup(context, f.config, slack);
    seasonId = (
      await seasons.configureSeason(
        context,
        {
          selector: 'test',
          label: 'Test',
          timezone: 'UTC',
          startDate: '2026-11-01',
          endDate: '2026-12-31',
        },
        undefined,
        'season',
        'Setup',
      )
    ).seasonId;
  }
  let clock = f.now;
  const foundation = {
    assertActive: contexts.assertActive,
    fenceActive: contexts.fenceActive,
    assertConfigured: configuration.assertConfigured,
  };
  const entries = createEntryProvider({ db, client, foundation, slack, now: () => clock });
  const operations = createOperationRepository(db, contexts.assertActive);
  const drafts = createDraftRepository(db, client);
  const capture = createManualCapture({
    drafts,
    configuration,
    entries,
    assertActive: contexts.assertActive,
    enqueue: operations.enqueue,
    now: () => clock,
  });
  return {
    ...f,
    harness,
    db,
    client,
    context,
    other,
    contexts,
    slack,
    configuration,
    seasons,
    seasonId,
    entries,
    operations,
    drafts,
    capture,
    advance() {
      clock = new Date(clock.getTime() + 31 * 60_000);
    },
  };
}
