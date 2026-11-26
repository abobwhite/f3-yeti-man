import type { App } from '@slack/bolt';
import type { createConfigurationProvider } from '../workspace-foundation/configuration.ts';
import type {
  createWorkspaceContextProvider,
  WorkspaceContext,
} from '../workspace-foundation/context.ts';
import type { HandlerResult } from '../workspace-foundation/dispatcher.ts';
import type { Operation } from '../workspace-foundation/operations.ts';
import { setupRequiredMessage } from '../workspace-foundation/setup-status.ts';
import type { createTenantSlackClients } from '../workspace-foundation/tenant-slack.ts';
import type { createDraftRepository } from './drafts.ts';
import { editorErrorMessage, privateStatusView, readMetadata } from './editor.ts';
import type { createManualCapture } from './manual-command.ts';
import { captureHelp, manualCommandKind } from './manual-command.ts';
import { editCommandId, registerModifyHandlers } from './modify-runtime.ts';
import type { createSummaryRuntime } from './summary-runtime.ts';

export function registerManualCapture(options: {
  app: App;
  appId: string;
  capture: ReturnType<typeof createManualCapture>;
  drafts: ReturnType<typeof createDraftRepository>;
  contexts: ReturnType<typeof createWorkspaceContextProvider>;
  configuration: ReturnType<typeof createConfigurationProvider>;
  tenantSlack: ReturnType<typeof createTenantSlackClients>;
  summaries: ReturnType<typeof createSummaryRuntime>;
}) {
  const { app, capture } = options;
  const resolve = (teamId: string, actorUserId: string) =>
    options.contexts.resolveWorkspaceContext({ teamId, actorUserId, appId: options.appId });
  const openModification = registerModifyHandlers({ app, capture, resolve });
  app.command('/yeti', async ({ ack, command, client, respond }) => {
    await ack();
    const context = await resolve(command.team_id, command.user_id);
    const status = await options.configuration.getSetupStatus(context);
    const kind = manualCommandKind(command.text);
    if (kind === 'configure') {
      let admin = true;
      try {
        await options.contexts.requireAdmin(context);
      } catch {
        admin = false;
      }
      await respond({
        response_type: 'ephemeral',
        text: admin
          ? 'Open the app Home tab to review and confirm setup.'
          : `Only a designated Yeti Man admin can configure setup.\n${setupRequiredMessage(status)}`,
      });
      return;
    }
    if (!status.ready) {
      await respond({ response_type: 'ephemeral', text: setupRequiredMessage(status) });
      return;
    }
    try {
      const entryId = editCommandId(command.text);
      if (entryId) {
        await openModification(context, entryId, command.channel_id, command.trigger_id, client);
        return;
      }
    } catch {
      await respond({
        response_type: 'ephemeral',
        text: 'Use /yeti edit <entry ID>. Find the ID on the saved summary.',
      });
      return;
    }
    if (kind === 'help') {
      await respond({ response_type: 'ephemeral', text: captureHelp });
      return;
    }
    const opened = await client.views.open({
      trigger_id: command.trigger_id,
      view: privateStatusView('Loading your private entry…'),
    });
    if (!opened.view?.id) return;
    try {
      const { view } = await capture.open(context, command.channel_id, client);
      await client.views.update({ view_id: opened.view.id, view });
    } catch (error) {
      await client.views.update({
        view_id: opened.view.id,
        view: privateStatusView(
          editorErrorMessage(error instanceof Error ? error.message : 'OPEN_FAILED'),
        ),
      });
    }
  });
  app.action('manual_field', async ({ ack, body, client }) => {
    await ack();
    if (!('view' in body) || !body.view || !('actions' in body) || !body.team?.id) return;
    try {
      const context = await resolve(body.team.id, body.user.id);
      const metadata = readMetadata(body.view.private_metadata);
      const view = await capture.change(
        context,
        metadata.id,
        metadata.version,
        body.view.state.values,
        body.actions[0].block_id,
      );
      await client.views.update({ view_id: body.view.id, hash: body.view.hash, view });
    } catch {
      app.logger.info('Private entry refresh requires current form state.');
    }
  });
  app.action('yeti_manual_review', async ({ ack, body, client }) => {
    await ack();
    if (!('view' in body) || !body.view || !body.team?.id) return;
    const context = await resolve(body.team.id, body.user.id);
    const metadata = readMetadata(body.view.private_metadata);
    const view = await capture.review(
      context,
      metadata.id,
      metadata.version,
      body.view.state.values,
    );
    await client.views.update({ view_id: body.view.id, hash: body.view.hash, view });
  });
  app.view(
    { callback_id: 'yeti_manual_submit', type: 'view_submission' },
    async ({ ack, body, view }) => {
      try {
        const context = await resolve(body.team?.id ?? '', body.user.id);
        const metadata = readMetadata(view.private_metadata);
        await capture.submit(context, metadata.id, metadata.version, view.state.values, view.id);
        await ack({
          response_action: 'update',
          view: privateStatusView(
            'Save accepted; validating and committing your entry. Competition credit is not confirmed yet.',
          ),
        });
      } catch (error) {
        await ack({
          response_action: 'errors',
          errors: {
            temperature: editorErrorMessage(
              error instanceof Error ? error.message : 'INVALID_ENTRY',
            ),
          },
        });
      }
    },
  );
  app.view(
    { callback_id: 'yeti_manual_submit', type: 'view_closed' },
    async ({ ack, body, view }) => {
      await ack();
      const context = await resolve(body.team?.id ?? '', body.user.id);
      const metadata = readMetadata(view.private_metadata);
      await capture.cancel(context, metadata.id, metadata.version);
    },
  );
  async function update(
    context: WorkspaceContext,
    viewId: string | undefined,
    view:
      | ReturnType<typeof privateStatusView>
      | ReturnType<typeof import('./editor.ts').editorView>,
  ) {
    if (!viewId) return;
    try {
      await app.client.views.update({
        token: await options.tenantSlack.token(context.teamId),
        view_id: viewId,
        view,
      });
    } catch {
      app.logger.info('Private entry result retained; original modal is unavailable.');
    }
  }
  return async (job: Operation): Promise<HandlerResult> => {
    const actor = await options.drafts.operationActor(job.teamId, job.regionId, job.payloadRef);
    const context = await resolve(job.teamId, actor);
    if (context.regionId !== job.regionId)
      return { status: 'failed', resultCode: 'DRAFT_TENANT_MAPPING_CHANGED' };
    try {
      const result = await capture.process(
        context,
        job.payloadRef,
        job.operationKey,
        await options.tenantSlack.channels(context),
      );
      if (!result.duplicate) await options.summaries.delivery.deliver(context, job.operationKey);
      const confirmation = await options.summaries.delivery.confirmation(
        context,
        result.entry.entryId,
      );
      const text = result.duplicate
        ? result.entry.status === 'archived'
          ? `An archived entry already exists for this workout. No new credit was awarded.\n${confirmation.text.replace('Saved.', '').replace('Saved;', 'Summary:')}`
          : `An entry already exists for this workout. Use Modify on its saved summary. No attendance was replaced.\n${confirmation.text.replace('Saved.', '').replace('Saved;', 'Summary:')}`
        : confirmation.text;
      await update(context, result.draft.viewId, privateStatusView(text));
      if (confirmation.text.includes('pending'))
        return {
          status: 'pending',
          resultCode: 'ENTRY_COMMITTED_SUMMARY_PENDING',
          retryAfterMs: 1500,
        };
      return {
        status: 'succeeded',
        resultCode: result.duplicate ? 'ENTRY_ALREADY_EXISTS' : 'ENTRY_COMMITTED',
        resultRef: result.entry.entryId,
      };
    } catch {
      const draft = await options.drafts.get(context, job.payloadRef);
      if (draft.status === 'queued' || draft.status === 'saved')
        return { status: 'pending', resultCode: 'ENTRY_COMMIT_RETRY', retryAfterMs: 1000 };
      try {
        const reopened = await capture.reopen(context, draft._id);
        await update(context, draft.viewId, reopened.view);
      } catch {
        await update(
          context,
          draft.viewId,
          privateStatusView(
            'Setup changed or is incomplete. Your proposed values are retained privately; open /yeti configure before retrying.',
          ),
        );
      }
      return { status: 'failed', resultCode: 'ENTRY_VALIDATION_REQUIRES_REVIEW' };
    }
  };
}
