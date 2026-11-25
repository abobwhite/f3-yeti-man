import type { ClientSession } from 'mongodb';
import type { WorkspaceContext } from './context.ts';

export interface SetupStatus {
  ready: boolean;
  missingSettings: string[];
  configurationRevision?: number;
}

export function setupRequiredMessage(status: SetupStatus): string {
  if (status.ready) return 'F3 Yeti Man is configured.';
  return [
    'F3 Yeti Man setup is incomplete. A Yeti Man admin must configure:',
    ...status.missingSettings.map((label) => `• ${label}`),
    'Open the app Home tab or run /yeti configure.',
  ].join('\n');
}

export function requireSetupRevision(
  provider: {
    assertConfigured(
      context: WorkspaceContext,
      revision?: number,
      session?: ClientSession,
    ): Promise<unknown>;
  },
  context: WorkspaceContext,
  revision: number,
  session: ClientSession,
) {
  return provider.assertConfigured(context, revision, session);
}
