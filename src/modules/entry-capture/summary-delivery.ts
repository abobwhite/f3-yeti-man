import type { SummaryJob } from '../entry-ledger/summary-outbox.ts';
import type { WorkspaceContext } from '../workspace-foundation/context.ts';
import type { createMessageViews, MessageReference } from './message-views.ts';
import { renderSummary, type SummaryState, savedConfirmation, summaryLink } from './summary.ts';

export interface SummarySlackClient {
  post(channelId: string, message: ReturnType<typeof renderSummary>): Promise<MessageReference>;
  update(
    reference: MessageReference,
    message: { text: string; blocks: ReturnType<typeof renderSummary>['blocks'] },
  ): Promise<void>;
}
export function retryDelay(error: unknown): number | null {
  const value =
    typeof error === 'object' && error !== null && 'retryAfter' in error
      ? Number(error.retryAfter)
      : NaN;
  return Number.isFinite(value) && value > 0 ? Math.min(300_000, Math.ceil(value * 1000)) : null;
}

export function createSummaryDelivery(options: {
  views: ReturnType<typeof createMessageViews>;
  outbox: {
    claim(context: WorkspaceContext, key: string, now: Date): Promise<SummaryJob | null>;
    finish(
      context: WorkspaceContext,
      job: SummaryJob,
      status: SummaryJob['status'],
      now: Date,
      retryAfterMs?: number,
    ): Promise<void>;
  };
  loadState(context: WorkspaceContext, entryId: string): Promise<SummaryState>;
  authorizeDestination(context: WorkspaceContext, channelId: string): Promise<void>;
  reserveSlot(context: WorkspaceContext, now: Date): Promise<number>;
  deferSlot(context: WorkspaceContext, until: Date): Promise<void>;
  slack(context: WorkspaceContext): Promise<SummarySlackClient>;
  now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());
  return {
    async deliver(context: WorkspaceContext, operationKey: string) {
      const job = await options.outbox.claim(context, operationKey, now());
      if (!job) return;
      const view = await options.views.claim(context, job.entryId, now());
      if (!view) {
        const current = await options.views.get(context, job.entryId);
        await options.outbox.finish(
          context,
          job,
          current?.status === 'uncertain' ? 'uncertain' : 'pending',
          now(),
        );
        return;
      }
      let sending = false;
      try {
        const client = await options.slack(context);
        const wait = await options.reserveSlot(context, now());
        if (wait > 0) {
          await options.outbox.finish(context, job, 'pending', now(), wait);
          return;
        }
        // Reload after acquiring serialization/rate-limit boundaries. Job revisions are hints only.
        const state = await options.loadState(context, job.entryId);
        if (view.fixedChannelId && view.fixedChannelId !== state.channelId)
          throw new Error('FIXED_AO_CONTEXT_CHANGED');
        await options.authorizeDestination(context, state.channelId);
        const message = renderSummary(state);
        if (!(await options.views.markSending(context, view, now()))) {
          await options.outbox.finish(context, job, 'pending', now());
          return;
        }
        sending = true;
        let canonical = view.canonical;
        const previous = [...view.previous];
        if (canonical && canonical.channelId === state.channelId)
          await client.update(canonical, message);
        else {
          const old = canonical;
          canonical = await client.post(state.channelId, message);
          if (old) previous.push(old);
          // Persist the new canonical reference before refreshing any older locations.
          await options.views.checkpoint(context, view, canonical, previous, state.entry.version);
        }
        const link = summaryLink(context.teamId, canonical.channelId, canonical.messageTs);
        for (const reference of previous) {
          await options.authorizeDestination(context, reference.channelId);
          await client.update(reference, {
            text: `Entry moved. <${link}|View current entry>`,
            blocks: [],
          });
        }
        await options.views.checkpoint(context, view, canonical, [], state.entry.version);
        await options.views.release(context, view, 'idle');
        sending = false;
        await options.outbox.finish(context, job, 'succeeded', now());
      } catch (error) {
        const delay = retryDelay(error);
        if (delay !== null) await options.deferSlot(context, new Date(now().getTime() + delay));
        const uncertain = sending && delay === null;
        await options.views.release(context, view, uncertain ? 'uncertain' : 'idle');
        sending = false;
        await options.outbox.finish(
          context,
          job,
          uncertain ? 'uncertain' : 'pending',
          now(),
          delay ?? 1000,
        );
      } finally {
        if (!sending) await options.views.release(context, view, 'idle');
      }
    },
    async confirmation(context: WorkspaceContext, entryId: string) {
      try {
        const view = await options.views.get(context, entryId);
        const state = await options.loadState(context, entryId);
        return savedConfirmation(
          view?.status === 'idle' && view.canonical && view.version >= state.entry.version
            ? summaryLink(context.teamId, view.canonical.channelId, view.canonical.messageTs)
            : undefined,
        );
      } catch {
        // The ledger receipt already committed; delivery/read failure cannot turn it into Save failed.
        return savedConfirmation();
      }
    },
  };
}

export function startSummaryWorker(runOnce: () => Promise<void>, onError: () => void) {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    void runOnce()
      .catch(onError)
      .finally(() => {
        running = false;
      });
  }, 1000);
  return () => clearInterval(timer);
}
