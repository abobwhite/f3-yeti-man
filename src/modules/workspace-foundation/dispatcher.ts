import type { Operation } from './operations.ts';

export type HandlerResult =
  | { status: 'succeeded'; resultCode: string; resultRef?: string }
  | { status: 'pending'; resultCode: string; retryAfterMs?: number }
  | { status: 'failed' | 'uncertain'; resultCode: string; resultRef?: string };

export function createOperationDispatcher(options: {
  repository: {
    claim(now?: Date, leaseMs?: number, maxAttempts?: number): Promise<Operation | null>;
    finish(
      job: Operation,
      outcome: {
        status: 'succeeded' | 'pending' | 'failed' | 'uncertain';
        resultCode: string;
        resultRef?: string;
        availableAt?: Date;
      },
    ): Promise<boolean>;
  };
  handlers: Readonly<Record<string, (job: Operation) => Promise<HandlerResult>>>;
  now?: () => Date;
  maxAttempts?: number;
  leaseMs?: number;
  onError?: (error: unknown) => void;
}) {
  const { repository, handlers } = options;
  const now = options.now ?? (() => new Date());
  const maxAttempts = options.maxAttempts ?? 5;
  const leaseMs = options.leaseMs ?? 30_000;
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  async function runOnce(): Promise<boolean> {
    const job = await repository.claim(now(), leaseMs, maxAttempts);
    if (!job) return false;
    const handler = handlers[job.type];
    let result: HandlerResult;
    if (!handler) {
      result = { status: 'failed', resultCode: 'UNKNOWN_OPERATION_TYPE' };
    } else {
      try {
        result = await handler(job);
      } catch {
        // An exception may have occurred after a remote request was sent. Handlers
        // must classify safe retry errors explicitly; unknown outcomes stop here.
        result = { status: 'uncertain', resultCode: 'HANDLER_OUTCOME_UNKNOWN' };
      }
    }
    const retry = result.status === 'pending';
    const retryAfterMs = result.status === 'pending' ? result.retryAfterMs : undefined;
    await repository.finish(job, {
      status: retry && job.attempts >= maxAttempts ? 'failed' : result.status,
      resultCode: retry && job.attempts >= maxAttempts ? 'RETRY_EXHAUSTED' : result.resultCode,
      ...('resultRef' in result && result.resultRef ? { resultRef: result.resultRef } : {}),
      ...(retry
        ? {
            availableAt: new Date(
              now().getTime() +
                Math.max(retryAfterMs ?? Math.min(60_000, 1000 * 2 ** (job.attempts - 1)), 1000),
            ),
          }
        : {}),
    });
    return true;
  }
  return {
    runOnce,
    start(intervalMs = 1000) {
      if (timer) return;
      timer = setInterval(() => {
        if (running) return;
        running = true;
        void runOnce()
          .catch((error: unknown) => options.onError?.(error))
          .finally(() => {
            running = false;
          });
      }, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}
