import type { App } from '@slack/bolt';
import { seasonInputSchema } from '../entry-ledger/season-repository.ts';
import { type createSeasonProvider, suggestWinterSeason } from '../entry-ledger/seasons.ts';
import type { createConfigurationProvider } from './configuration.ts';
import type { createWorkspaceContextProvider } from './context.ts';
import { requireMember } from './members.ts';
import { parseSetupFields, setupHome, setupModal } from './setup-home.ts';
import { setupRequiredMessage } from './setup-status.ts';

type SetupDependencies = {
  app: App;
  appId: string;
  contexts: ReturnType<typeof createWorkspaceContextProvider>;
  configuration: ReturnType<typeof createConfigurationProvider>;
  seasons: ReturnType<typeof createSeasonProvider>;
};

export function registerSetupHandlers({
  app,
  appId,
  contexts,
  configuration,
  seasons,
}: SetupDependencies): void {
  app.command('/yeti', async ({ ack, command, client }) => {
    const context = await contexts.resolveWorkspaceContext({
      teamId: command.team_id,
      actorUserId: command.user_id,
      appId,
    });
    await requireMember(context, command.user_id, client, contexts.assertActive);
    const status = await configuration.getSetupStatus(context);
    if (command.text.trim().toLowerCase() === 'configure') {
      let isAdmin = true;
      try {
        await contexts.requireAdmin(context);
      } catch {
        isAdmin = false;
      }
      await ack({
        response_type: 'ephemeral',
        text: isAdmin
          ? 'Open the F3 Yeti Man app Home tab to review and confirm setup.'
          : `Only a designated Yeti Man admin can configure setup.\n${setupRequiredMessage(status)}`,
      });
      return;
    }
    await ack({
      response_type: 'ephemeral',
      text: status.ready ? 'Yeti Man commands are being added.' : setupRequiredMessage(status),
    });
  });

  app.event('app_home_opened', async ({ event, body, client }) => {
    if (event.tab !== 'home') return;
    const context = await contexts.resolveWorkspaceContext({
      teamId: body.team_id,
      actorUserId: event.user,
      appId,
    });
    await requireMember(context, event.user, client, contexts.assertActive);
    let isAdmin = true;
    try {
      await contexts.requireAdmin(context);
    } catch {
      isAdmin = false;
    }
    await client.views.publish({
      user_id: event.user,
      view: setupHome(await configuration.getSetupStatus(context), isAdmin),
    });
  });

  app.action('yeti_setup_open', async ({ ack, body, client }) => {
    await ack();
    if (
      !('trigger_id' in body) ||
      !('user' in body) ||
      !body.user?.id ||
      !('team' in body) ||
      !body.team?.id
    )
      return;
    const context = await contexts.resolveWorkspaceContext({
      teamId: body.team.id,
      actorUserId: body.user.id,
      appId,
    });
    await contexts.requireAdmin(context);
    const current = await configuration.rawConfiguration(context);
    const existingSeason = (await seasons.listSeasons(context))[0];
    await client.views.open({
      trigger_id: body.trigger_id,
      view: setupModal(
        current,
        configuration.getSuggestedSetup(),
        existingSeason ??
          suggestWinterSeason(new Date().getUTCFullYear(), current?.timezone ?? 'America/New_York'),
        current?.revision,
      ),
    });
  });

  app.view('yeti_setup_submit', async ({ ack, body, view, client }) => {
    try {
      const context = await contexts.resolveWorkspaceContext({
        teamId: body.team?.id ?? '',
        actorUserId: body.user.id,
        appId,
      });
      const current = await configuration.rawConfiguration(context);
      const { configuration: input, season } = parseSetupFields(
        view.state.values,
        current ?? configuration.getSuggestedSetup(),
      );
      const validatedSeason = seasonInputSchema.parse(season);
      const expectedRevision = Number(view.private_metadata);
      await configuration.confirmInitialSetup(
        context,
        input,
        client,
        expectedRevision || undefined,
      );
      const existingSeason = (await seasons.listSeasons(context)).find(
        (item) => item.selector === validatedSeason.selector,
      );
      if (
        !existingSeason ||
        existingSeason.label !== validatedSeason.label ||
        existingSeason.startDate !== validatedSeason.startDate ||
        existingSeason.endDate !== validatedSeason.endDate ||
        existingSeason.timezone !== validatedSeason.timezone
      ) {
        await seasons.configureSeason(
          context,
          validatedSeason,
          existingSeason?.version,
          `setup-season:${view.id}`,
          'Initial setup',
          existingSeason?.seasonId,
        );
      }
      await ack();
      await client.views.publish({
        user_id: body.user.id,
        view: setupHome(await configuration.getSetupStatus(context), true),
      });
    } catch (error) {
      await ack({
        response_action: 'errors',
        errors: {
          region: error instanceof Error ? error.message.slice(0, 200) : 'Invalid setup.',
        },
      });
    }
  });
}
