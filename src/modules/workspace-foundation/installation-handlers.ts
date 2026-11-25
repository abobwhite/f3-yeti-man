import type { App } from '@slack/bolt';
import type { Db } from 'mongodb';
import { revokeBotCredentials, revokeWorkspaceInstallation } from './installations.ts';

export function registerInstallationHandlers(app: App, db: Db, appId: string): void {
  app.event('app_uninstalled', async ({ body }) => {
    if (body.api_app_id !== appId) throw new Error('Unexpected Slack application ID.');
    await revokeWorkspaceInstallation(db, appId, body.team_id, body.event_time);
  });

  app.event('tokens_revoked', async ({ body, event }) => {
    if (body.api_app_id !== appId) throw new Error('Unexpected Slack application ID.');
    await revokeBotCredentials(db, appId, body.team_id, event.tokens.bot ?? [], body.event_time);
  });
}
