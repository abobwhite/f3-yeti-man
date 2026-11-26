import type { App } from '@slack/bolt';
import { z } from 'zod';
import type { WorkspaceContext } from '../workspace-foundation/context.ts';
import { editorErrorMessage, privateStatusView } from './editor.ts';
import type { createManualCapture } from './manual-command.ts';
import { verifiedEditOrigin } from './modify.ts';

type Client = App['client'];
export function editCommandId(text: string): string | undefined {
  if (text.trim().split(/\s+/)[0]?.toLowerCase() !== 'edit') return;
  const parts = text.trim().split(/\s+/);
  if (parts.length !== 2) throw new Error('ENTRY_ID_REQUIRED');
  return z.uuid().parse(parts[1]);
}
export function registerModifyHandlers(options: {
  app: App;
  capture: ReturnType<typeof createManualCapture>;
  resolve(teamId: string, userId: string): Promise<WorkspaceContext>;
}) {
  async function open(
    context: WorkspaceContext,
    entryId: string,
    origin: string,
    triggerId: string,
    client: Client,
  ) {
    const opened = await client.views.open({
      trigger_id: triggerId,
      view: privateStatusView('Loading the saved entry privately…'),
    });
    if (!opened.view?.id) return;
    try {
      const { view } = await options.capture.modify(
        context,
        z.uuid().parse(entryId),
        origin,
        client,
      );
      await client.views.update({ view_id: opened.view.id, view });
    } catch (error) {
      await client.views.update({
        view_id: opened.view.id,
        view: privateStatusView(
          editorErrorMessage(error instanceof Error ? error.message : 'OPEN_FAILED'),
        ),
      });
    }
  }
  options.app.action('yeti_entry_modify', async ({ ack, body, client }) => {
    await ack();
    if (!('actions' in body) || !body.team?.id || !('trigger_id' in body)) return;
    try {
      const action = z.object({ value: z.uuid() }).parse(body.actions[0]);
      const origin = verifiedEditOrigin(body);
      const context = await options.resolve(body.team.id, body.user.id);
      await open(context, action.value, origin, body.trigger_id, client);
    } catch {
      options.app.logger.info(
        'Saved entry edit requires an authenticated origin and current access.',
      );
    }
  });
  return open;
}
