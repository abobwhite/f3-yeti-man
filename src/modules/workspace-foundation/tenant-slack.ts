import type { WebClient } from '@slack/web-api';
import type { ChannelClient } from './channels.ts';
import type { WorkspaceContext } from './context.ts';
import type { createInstallationStore } from './installations.ts';

export function createTenantSlackClients(
  web: WebClient,
  installations: ReturnType<typeof createInstallationStore>,
) {
  async function token(teamId: string) {
    const installation = await installations.fetchInstallation({
      teamId,
      isEnterpriseInstall: false,
      enterpriseId: undefined,
    });
    if (!installation.bot?.token) throw new Error('INSTALLATION_UNAVAILABLE');
    return installation.bot.token;
  }
  return {
    token,
    async channels(context: WorkspaceContext): Promise<ChannelClient> {
      const botToken = await token(context.teamId);
      return {
        users: { info: (args) => web.users.info({ ...args, token: botToken }) },
        conversations: {
          info: (args) => web.conversations.info({ ...args, token: botToken }),
          members: (args) => web.conversations.members({ ...args, token: botToken }),
        },
      };
    },
  };
}
