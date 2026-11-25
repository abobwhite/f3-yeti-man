import type { App } from '@slack/bolt';
import type { Db } from 'mongodb';
import type { createEntryProvider } from '../entry-ledger/entries.ts';
import { createSummaryOutbox } from '../entry-ledger/summary-outbox.ts';
import { requirePublicLocalDestination } from '../workspace-foundation/channels.ts';
import type { createWorkspaceContextProvider } from '../workspace-foundation/context.ts';
import type { createInstallationStore } from '../workspace-foundation/installations.ts';
import type { createOperationRepository } from '../workspace-foundation/operations.ts';
import { createMessageViews } from './message-views.ts';
import { createSummaryDelivery, startSummaryWorker } from './summary-delivery.ts';

export function createSummaryRuntime(options: {
  db: Db;
  app: App;
  appId: string;
  contexts: ReturnType<typeof createWorkspaceContextProvider>;
  installations: ReturnType<typeof createInstallationStore>;
  operations: ReturnType<typeof createOperationRepository>;
  entries: ReturnType<typeof createEntryProvider>;
}) {
  const outbox = createSummaryOutbox(options.db);
  const views = createMessageViews(options.db);
  async function token(teamId: string) {
    const installation = await options.installations.fetchInstallation({
      teamId,
      isEnterpriseInstall: false,
      enterpriseId: undefined,
    });
    if (!installation.bot?.token) throw new Error('INSTALLATION_UNAVAILABLE');
    return installation.bot.token;
  }
  const delivery = createSummaryDelivery({
    views,
    outbox,
    deferSlot: (context, until) => options.operations.deferDeliverySlot(context, until),
    loadState: options.entries.getSummaryState,
    authorizeDestination: async (context, channelId) => {
      const botToken = await token(context.teamId);
      const client = {
        users: {
          info: (args: { user: string }) =>
            options.app.client.users.info({ ...args, token: botToken }),
        },
        conversations: {
          info: (args: { channel: string }) =>
            options.app.client.conversations.info({ ...args, token: botToken }),
          members: (args: { channel: string; cursor?: string; limit?: number }) =>
            options.app.client.conversations.members({ ...args, token: botToken }),
        },
      };
      await requirePublicLocalDestination(
        context,
        channelId,
        context.actorUserId,
        client,
        options.contexts.assertActive,
      );
    },
    reserveSlot: (context, now) => options.operations.reserveDeliverySlot(context, now, 1100),
    slack: async (context) => {
      const botToken = await token(context.teamId);
      return {
        async post(channelId, message) {
          const result = await options.app.client.chat.postMessage({
            token: botToken,
            channel: channelId,
            ...message,
            unfurl_links: false,
            unfurl_media: false,
          });
          if (!result.ok || result.channel !== channelId || !result.ts)
            throw new Error('SLACK_OUTCOME_UNKNOWN');
          return { channelId, messageTs: result.ts };
        },
        async update(reference, message) {
          const result = await options.app.client.chat.update({
            token: botToken,
            channel: reference.channelId,
            ts: reference.messageTs,
            ...message,
          });
          if (!result.ok) throw new Error('SLACK_OUTCOME_UNKNOWN');
        },
      };
    },
  });
  return {
    delivery,
    async runOnce() {
      const next = await outbox.next();
      if (!next) return;
      const context = await options.contexts.resolveWorkspaceContext({
        teamId: next.teamId,
        actorUserId: next.actorUserId,
        appId: options.appId,
      });
      if (context.regionId !== next.regionId) throw new Error('SUMMARY_TENANT_MAPPING_CHANGED');
      await delivery.deliver(context, next.operationKey);
    },
    start() {
      return startSummaryWorker(
        () => this.runOnce(),
        () => options.app.logger.error('Summary delivery pending.'),
      );
    },
  };
}
