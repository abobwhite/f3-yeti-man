import type { HandlerResult } from './dispatcher.ts';
import type { Operation } from './operations.ts';

export interface SlackMessageIntent {
  channelId: string;
  text: string;
  mode: 'post' | 'update';
  messageTs?: string;
  version: number;
}

export function createSlackDeliveryHandler(options: {
  // Resolve the latest version and authorization at dispatch time, not enqueue time.
  loadIntent: (job: Operation) => Promise<SlackMessageIntent | null>;
  assertActive: (job: Operation) => Promise<void>;
  markSending: (job: Operation) => Promise<boolean>;
  reserveSlot: (job: Operation, now: Date, spacingMs: number) => Promise<number>;
  deferSlot: (job: Operation, until: Date) => Promise<void>;
  send: (
    job: Operation,
    intent: SlackMessageIntent,
  ) => Promise<{ channelId: string; messageTs: string }>;
  now?: () => Date;
  minSpacingMs?: number;
}) {
  const now = options.now ?? (() => new Date());
  const spacing = options.minSpacingMs ?? 1100;
  return async (job: Operation): Promise<HandlerResult> => {
    try {
      await options.assertActive(job);
    } catch {
      return { status: 'failed', resultCode: 'INSTALLATION_OR_CONFIG_UNAVAILABLE' };
    }
    const intent = await options.loadIntent(job);
    if (!intent) return { status: 'failed', resultCode: 'MESSAGE_INTENT_UNAVAILABLE' };
    const current = now();
    const wait = await options.reserveSlot(job, current, spacing);
    if (wait > 0)
      return { status: 'pending', resultCode: 'INSTALLATION_RATE_LIMIT', retryAfterMs: wait };
    try {
      if (!(await options.markSending(job))) {
        return { status: 'uncertain', resultCode: 'LEASE_LOST_BEFORE_SEND' };
      }
      const sent = await options.send(job, intent);
      return {
        status: 'succeeded',
        resultCode: 'SLACK_ACCEPTED',
        resultRef: `${sent.channelId}:${sent.messageTs}`,
      };
    } catch (error) {
      const retryAfter =
        typeof error === 'object' && error !== null && 'retryAfter' in error
          ? Number(error.retryAfter)
          : NaN;
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        const retryAfterMs = Math.min(300_000, Math.ceil(retryAfter * 1000));
        await options.deferSlot(job, new Date(current.getTime() + retryAfterMs));
        return { status: 'pending', resultCode: 'SLACK_RATE_LIMIT', retryAfterMs };
      }
      // A lost response after chat.postMessage may already have created a message.
      return { status: 'uncertain', resultCode: 'SLACK_OUTCOME_UNKNOWN' };
    }
  };
}
